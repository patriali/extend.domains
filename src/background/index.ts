// Background entry point. All network I/O for the extension lives in this
// context (never in content scripts or the sidebar) — see the architecture
// section of the README.

import browser from "webextension-polyfill";
import { deobfuscate } from "../lib/deobfuscate";
import { findLastDomainInText, type ParsedDomain } from "../lib/domain";
import { fetchDnsSummary } from "../lib/doh";
import { brandCasingForLabel, fetchSiteMetadata } from "../lib/metadata";
import { scoreDomain, type ScoreResult } from "../lib/scorer";
import { fetchWaybackFirst } from "../lib/wayback";
import type {
  AnyMessage,
  DomainLookupState,
  LookupState,
  StateChangedMessage,
} from "../shared/messages";
import { loadDeobfuscation } from "../shared/deobfuscation";
import { pushHistory } from "../shared/history";
import { DOH_ORIGINS, hasAccess } from "../shared/net-permissions";
import { loadWeights, WEIGHTS_STORAGE_KEY } from "../shared/weights";
import { cacheGet, cachePatch, cacheRemove, type DomainCacheRecord } from "./cache";
import { queuedFetch, singleFlight } from "./net";
import { initPanelOpenBehavior, openPanelFromMenuClick } from "./panel";
import { lookupRdap } from "./rdap";

const MENU_ID = "extend-domains.lookup";
const STATE_KEY = "lookupState";

initPanelOpenBehavior();

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: MENU_ID,
    title: 'Look up "%s"',
    contexts: ["selection"],
  });
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  // Synchronous first — see openPanelFromMenuClick on user-gesture scope.
  openPanelFromMenuClick(tab);
  void handleLookupRequest(info.selectionText ?? "", true);
});

browser.runtime.onMessage.addListener(
  (message: unknown): Promise<LookupState> | undefined => {
    const msg = message as AnyMessage;
    switch (msg.type) {
      case "getState":
        return getState();
      case "selection":
        void handleLookupRequest(msg.text, msg.explicit === true, msg.defaultTld);
        return undefined;
      case "refresh":
        void refreshCurrent(msg.force === true);
        return undefined;
      default:
        return undefined;
    }
  },
);

async function handleLookupRequest(
  text: string,
  explicit: boolean,
  defaultTld?: string,
): Promise<void> {
  let parsed = findLastDomainInText(text);
  // Obfuscated spellings ("example dot com", "example[.]com") resolve only when
  // the user has opted in. This runs for both explicit lookups (context menu /
  // search box / current-tab) and passive page selections; the content script
  // gates the passive path so only opted-in users pay any per-page cost. Each
  // candidate is still PSL-validated, so a real TLD remains required.
  if (parsed === null) {
    const { enabled, spaces } = await loadDeobfuscation();
    if (enabled) {
      for (const candidate of deobfuscate(text, { spaces })) {
        parsed = findLastDomainInText(candidate);
        if (parsed !== null) break;
      }
    }
  }
  // A bare hostname label typed in the search bar ("grok") carries no TLD, so
  // parsing finds no domain. Retry with the caller's default TLD appended so
  // "grok" resolves to "grok.com". Restricted to a single label with no dot to
  // avoid mangling partial ("example." → "example..com") or multi-word input.
  if (parsed === null && defaultTld !== undefined && /^[a-z0-9-]+$/i.test(text.trim())) {
    parsed = findLastDomainInText(`${text.trim()}.${defaultTld}`);
  }
  if (parsed === null) {
    // Explicit requests (search bar, context menu) get an explicit answer; a
    // failed passive page selection just stays quiet.
    if (explicit) {
      live = null; // stop in-flight sources from overwriting the invalid state
      await setState({ kind: "invalid", text: text.trim().slice(0, 100) });
    }
    return;
  }
  const current = await getState();
  if (current.kind === "domain" && current.domain.ascii === parsed.ascii) return;
  await runLookup(parsed);
}

async function refreshCurrent(force: boolean): Promise<void> {
  const current = await getState();
  if (current.kind !== "domain") return;
  if (force) await cacheRemove(current.domain.registrableDomain);
  await runLookup(current.domain);
}

// Weight edits in the options page re-score the current lookup live.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !(WEIGHTS_STORAGE_KEY in changes)) return;
  void (async () => {
    if (live === null) return;
    const score = await computeScore(live.domain);
    await patchLive(live.domain.ascii, { score });
  })();
});

// In-memory copy of the in-progress lookup, so concurrent source completions
// merge synchronously instead of read-modify-writing storage against each
// other. Falls out of scope with the worker; storage.session keeps the last
// published snapshot for the sidebar.
let live: DomainLookupState | null = null;

async function patchLive(ascii: string, partial: Partial<DomainLookupState>): Promise<void> {
  // Don't clobber the panel if the user has moved on to another domain.
  if (live === null || live.domain.ascii !== ascii) return;
  live = { ...live, ...partial };
  await setState(live);
}

async function runLookup(parsed: ParsedDomain): Promise<void> {
  live = {
    kind: "domain",
    domain: parsed,
    score: await computeScore(parsed),
    dns: { status: "loading" },
    rdap: { status: "loading" },
    meta: { status: "loading" },
    wayback: { status: "loading" },
  };
  await setState(live);
  void pushHistory({ ascii: parsed.ascii, display: parsed.display }).catch(() => undefined);

  // Networked sources operate on the registrable domain (that's what RDAP
  // and delegation are about), even when a subdomain was selected. Each
  // source lands independently; none blocks another.
  const reg = parsed.registrableDomain;
  const cached = await cacheGet(reg);
  await Promise.all([
    runDnsSource(parsed.ascii, reg, cached),
    runRdapSource(parsed.ascii, reg, parsed.publicSuffix, cached),
    runMetaSource(parsed.ascii, reg, cached),
    runWaybackSource(parsed.ascii, reg, cached),
  ]);
}

async function runWaybackSource(
  ascii: string,
  reg: string,
  cached: DomainCacheRecord | null,
): Promise<void> {
  if (cached?.wayback !== undefined) {
    await patchLive(ascii, { wayback: { status: "ok", data: cached.wayback } });
    return;
  }
  try {
    const wayback = await singleFlight(`wayback:${reg}`, () =>
      fetchWaybackFirst(queuedFetch, reg),
    );
    await cachePatch(reg, { wayback });
    await patchLive(ascii, { wayback: { status: "ok", data: wayback } });
  } catch (err) {
    // Best-effort by design: no permission nagging, no cached failure —
    // just quietly unavailable this time around.
    console.warn(`Wayback lookup failed for ${reg}:`, err);
    await patchLive(ascii, { wayback: { status: "unavailable" } });
  }
}

async function runMetaSource(
  ascii: string,
  reg: string,
  cached: DomainCacheRecord | null,
): Promise<void> {
  if (cached?.meta !== undefined) {
    await patchLive(ascii, { meta: { status: "ok", data: cached.meta } });
    await rescoreFromBrand(ascii, cached.meta.title);
    return;
  }
  if (cached?.metaUnreachable === true) {
    await patchLive(ascii, { meta: { status: "unavailable" } });
    return;
  }
  try {
    const meta = await singleFlight(`meta:${reg}`, () => fetchSiteMetadata(queuedFetch, reg));
    await cachePatch(reg, { meta });
    await patchLive(ascii, { meta: { status: "ok", data: meta } });
    await rescoreFromBrand(ascii, meta.title);
  } catch (err) {
    // Failure is ambiguous: dead site, or no host access (Firefox with the
    // all-sites permission not granted). Distinguish after the fact.
    if (!(await hasAccess(["<all_urls>"]))) {
      await patchLive(ascii, { meta: { status: "needs-permission" } });
      return;
    }
    console.warn(`metadata fetch failed for ${reg}:`, err);
    await cachePatch(reg, { metaUnreachable: true });
    await patchLive(ascii, { meta: { status: "unavailable" } });
  }
}

// When the site's own brand title spells the label in camelCase (SilkCloak),
// re-score using that casing so word segmentation improves even though the
// selected domain was lowercase.
async function rescoreFromBrand(ascii: string, title: string | undefined): Promise<void> {
  if (title === undefined || live === null || live.domain.ascii !== ascii) return;
  const brand = brandCasingForLabel(title, live.domain.label);
  if (brand === null || brand === live.domain.caseLabel) return;
  const score = await computeScore({ ...live.domain, caseLabel: brand });
  await patchLive(ascii, { score });
}

async function runDnsSource(
  ascii: string,
  reg: string,
  cached: DomainCacheRecord | null,
): Promise<void> {
  if (cached?.dns !== undefined) {
    await patchLive(ascii, { dns: { status: "ok", data: cached.dns } });
    return;
  }
  if (!(await hasAccess(DOH_ORIGINS))) {
    await patchLive(ascii, { dns: { status: "needs-permission" } });
    return;
  }
  try {
    const dns = await singleFlight(`dns:${reg}`, () => fetchDnsSummary(queuedFetch, reg));
    await cachePatch(reg, { dns });
    await patchLive(ascii, { dns: { status: "ok", data: dns } });
  } catch (err) {
    console.warn(`DNS lookup failed for ${reg}:`, err);
    await patchLive(ascii, { dns: { status: "unavailable" } });
  }
}

async function runRdapSource(
  ascii: string,
  reg: string,
  publicSuffix: string,
  cached: DomainCacheRecord | null,
): Promise<void> {
  if (cached?.rdap !== undefined) {
    await patchLive(ascii, { rdap: { status: "ok", data: cached.rdap } });
    return;
  }
  const tld = publicSuffix.split(".").pop() ?? publicSuffix;
  try {
    const rdap = await singleFlight(`rdap:${reg}`, () => lookupRdap(reg, tld));
    // "unknown" is transient (timeouts, 5xx) and "no-rdap" is free to
    // recompute — only conclusive answers earn a cache slot.
    if (rdap.kind === "registered" || rdap.kind === "unregistered") {
      await cachePatch(reg, { rdap });
    }
    await patchLive(ascii, { rdap: { status: "ok", data: rdap } });
  } catch (err) {
    console.warn(`RDAP lookup failed for ${reg}:`, err);
    await patchLive(ascii, { rdap: { status: "unavailable" } });
  }
}

async function computeScore(parsed: ParsedDomain): Promise<ScoreResult> {
  // The registrable label's unicode form sits just left of the suffix labels.
  const displayLabels = parsed.display.split(".");
  const suffixLen = parsed.publicSuffix.split(".").length;
  return scoreDomain(
    {
      label: parsed.label,
      publicSuffix: parsed.publicSuffix,
      displayLabel: parsed.isIdn ? displayLabels[displayLabels.length - suffixLen - 1] : undefined,
      caseLabel: parsed.caseLabel,
    },
    await loadWeights(),
  );
}

async function setState(state: LookupState): Promise<void> {
  await browser.storage.session.set({ [STATE_KEY]: state });
  try {
    const msg: StateChangedMessage = { type: "stateChanged", state };
    await browser.runtime.sendMessage(msg);
  } catch {
    // No sidebar open to receive it — fine, it reads the stored state on open.
  }
}

async function getState(): Promise<LookupState> {
  const record = await browser.storage.session.get(STATE_KEY);
  return (record[STATE_KEY] as LookupState | undefined) ?? { kind: "idle" };
}
