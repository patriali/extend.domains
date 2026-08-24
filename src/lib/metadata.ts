// Site metadata: fetch the domain root from the background, regex-parse only
// the <head> region. No DOMParser — Chrome MV3 service workers don't have
// one, and six tags don't justify chrome.offscreen; the same regex path runs
// in both browsers so they can't drift.

import type { FetchLike } from "./doh.ts";
import { splitDomain } from "./psl.ts";

export interface SiteMetadata {
  /** response.url after redirects. */
  finalUrl: string;
  /** Redirect landed on a different registrable domain — itself a signal. */
  crossDomain: boolean;
  /** og:title, falling back to <title>. */
  title?: string;
  description?: string;
  /** Absolute URL. */
  ogImage?: string;
  themeColor?: string;
}

const FETCH_TIMEOUT_MS = 4000;
// We ask for 32 KiB via Range, but servers routinely ignore it, and real
// heads front-load 100 KB+ of preload/inline noise before <title> (seen on
// marketplace landers). The read stops early at </head>, so this cap only
// bites on pathological pages.
const MAX_BYTES = 256 * 1024;

/** Throws on unreachable/unusable; the caller maps that to "unavailable". */
export async function fetchSiteMetadata(
  fetchFn: FetchLike,
  registrableDomain: string,
): Promise<SiteMetadata> {
  let res: Response | null = null;
  let lastError: unknown;
  for (const scheme of ["https", "http"]) {
    try {
      res = await fetchFn(`${scheme}://${registrableDomain}/`, {
        headers: { Range: "bytes=0-32768", Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (res === null) throw lastError ?? new Error("unreachable");
  if (res.status !== 200 && res.status !== 206) {
    throw new Error(`HTTP ${res.status}`);
  }
  const html = await readCapped(res, MAX_BYTES);
  return buildMetadata(html, res.url, registrableDomain);
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (res.body === null) return "";
  const reader = res.body.getReader();
  // Charset sniffing is out of scope for v1: UTF-8 (the overwhelming default)
  // with replacement characters for anything exotic.
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let out = "";
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (received >= maxBytes || /<\/head[\s>]/i.test(out)) {
      void reader.cancel().catch(() => undefined);
      break;
    }
  }
  return out;
}

/** Pure assembly from raw HTML — separately testable from the fetch. */
export function buildMetadata(
  html: string,
  finalUrl: string,
  requestedDomain: string,
): SiteMetadata {
  const head = parseHead(html);
  let crossDomain = false;
  try {
    const finalHost = new URL(finalUrl).hostname.replace(/\.$/, "");
    const finalReg = splitDomain(finalHost)?.registrableDomain ?? finalHost;
    crossDomain = finalReg !== requestedDomain;
  } catch {
    // keep finalUrl as-is, no cross-domain claim
  }
  const ogImage = head.ogImage !== undefined ? absolutize(head.ogImage, finalUrl) : undefined;
  return {
    finalUrl,
    crossDomain,
    ...(head.title !== undefined ? { title: head.title } : {}),
    ...(head.description !== undefined ? { description: head.description } : {}),
    ...(ogImage !== undefined ? { ogImage } : {}),
    ...(head.themeColor !== undefined ? { themeColor: head.themeColor } : {}),
  };
}

interface ParsedHead {
  title?: string;
  description?: string;
  ogImage?: string;
  themeColor?: string;
}

export function parseHead(html: string): ParsedHead {
  const headEnd = html.search(/<\/head[\s>]/i);
  const head = headEnd === -1 ? html : html.slice(0, headEnd);

  const meta: Record<string, string> = {};
  for (const tag of head.match(/<meta\s[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key === undefined || content === undefined || key in meta) continue;
    meta[key] = clean(content);
  }

  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = pick(meta["og:title"], titleTag !== undefined ? clean(titleTag) : undefined);
  const description = pick(meta["og:description"], meta["description"]);

  return {
    ...(title !== undefined ? { title: title.slice(0, 200) } : {}),
    ...(description !== undefined ? { description: description.slice(0, 400) } : {}),
    ...(meta["og:image"] !== undefined && meta["og:image"] !== ""
      ? { ogImage: meta["og:image"] }
      : {}),
    ...(meta["theme-color"] !== undefined ? { themeColor: meta["theme-color"] } : {}),
  };
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (m === null) return undefined;
  return m[1] ?? m[2] ?? m[3];
}

function pick(...candidates: Array<string | undefined>): string | undefined {
  return candidates.find((c) => c !== undefined && c !== "");
}

function clean(text: string): string {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", copy: "©", reg: "®", trade: "™",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent.startsWith("#")) {
      const cp =
        ent[1]?.toLowerCase() === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

/**
 * If the site's brand title reveals a camelCase spelling of the (lowercase)
 * registrable label — e.g. title "SilkCloak.com — …" for label "silkcloak" —
 * returns "SilkCloak" so the scorer can re-segment on the intended word
 * boundaries. Returns null when the title has no camelCase match. Pure string
 * work; no scorer dependency.
 */
export function brandCasingForLabel(title: string, asciiLabel: string): string | null {
  const CASE_BOUNDARY = /\p{Ll}\p{Lu}|\p{Lu}\p{Lu}\p{Ll}/u;
  for (const token of title.match(/\p{L}+/gu) ?? []) {
    if (token.toLowerCase() !== asciiLabel) continue;
    return CASE_BOUNDARY.test(token) ? token : null;
  }
  return null;
}

function absolutize(src: string, baseUrl: string): string | undefined {
  try {
    const abs = new URL(src, baseUrl);
    return abs.protocol === "https:" || abs.protocol === "http:" ? abs.href : undefined;
  } catch {
    return undefined;
  }
}
