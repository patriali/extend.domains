// Turns raw selected text into a validated, PSL-split domain — or null.
// Pure module: no extension imports. Runs in the background context.
//
// Normalization leans on the WHATWG URL parser (available in service workers
// and Node alike): it lowercases, IDNA-punycodes unicode labels, and handles
// URL-shaped selections ("https://foo.com/path") without any extra library.

import { DOMAIN_SCAN, stripWrapping } from "./domain-pattern.ts";
import { toUnicodeHost } from "./punycode.ts";
import { splitDomain, type SplitDomain } from "./psl.ts";

export interface ParsedDomain extends SplitDomain {
  /** Punycoded, lowercased hostname, no trailing dot — the canonical key. */
  ascii: string;
  /** The host as the user saw it (may be unicode), for display. */
  display: string;
  isIdn: boolean;
  /** Original-case registrable label from the selection when derivable (Latin
   * only), e.g. "SilkCloak" — enables camelCase word splitting. Else `label`. */
  caseLabel: string;
}

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

export function parseDomainCandidate(raw: string): ParsedDomain | null {
  const text = stripWrapping(raw.trim());
  if (text.length === 0 || text.length > 300 || /\s/u.test(text)) return null;

  let host: string;
  try {
    host = new URL(SCHEME_RE.test(text) ? text : `http://${text}`).hostname;
  } catch {
    return null;
  }
  if (host.startsWith("[")) return null; // IPv6 literal
  host = host.replace(/\.$/u, "");
  if (!host.includes(".") || IPV4_RE.test(host)) return null;

  const split = splitDomain(host);
  if (split === null) return null;

  return {
    ascii: host,
    // Decoding the canonical ascii form (rather than echoing the selection)
    // gives the same unicode display whether the user selected "münchen.de"
    // or "xn--mnchen-3ya.de".
    display: toUnicodeHost(host),
    isIdn: host.split(".").some((l) => l.startsWith("xn--")),
    caseLabel: originalCaseLabel(text, split.label),
    ...split,
  };
}

/** Recovers the label's original casing from the raw selection (the URL parser
 * lowercases the host), so "SilkCloak.com" keeps "SilkCloak". */
function originalCaseLabel(source: string, lowerLabel: string): string {
  const i = source.toLowerCase().indexOf(lowerLabel);
  if (i < 0) return lowerLabel; // e.g. IDN punycode not present in the source
  const slice = source.slice(i, i + lowerLabel.length);
  return slice.toLowerCase() === lowerLabel ? slice : lowerLabel;
}

const SCAN_LIMIT = 2000;

/**
 * Returns the last PSL-valid domain found anywhere in `raw` — so a domain
 * highlighted inside a sentence ("…signed up on DomainLanders.com thank…")
 * still resolves, and when the selection spans several domains the trailing
 * one wins. A bare-domain selection takes the exact fast path; otherwise every
 * domain-shaped run is tried and the last that validates wins (shaped-but-
 * invalid tokens like "readme.txt" or a bare "co.uk" are skipped).
 */
export function findLastDomainInText(raw: string): ParsedDomain | null {
  const whole = parseDomainCandidate(raw);
  if (whole !== null) return whole;
  let last: ParsedDomain | null = null;
  for (const match of raw.slice(0, SCAN_LIMIT).matchAll(DOMAIN_SCAN)) {
    const parsed = parseDomainCandidate(match[0]);
    if (parsed !== null) last = parsed;
  }
  return last;
}
