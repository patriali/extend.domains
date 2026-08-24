// Public Suffix List matching, per the algorithm at
// https://publicsuffix.org/list/ — exception rules win, then the longest
// matching rule; wildcard rules (*.ck) match exactly one extra label.
//
// Pure module: no extension imports, safe to unit-test under plain Node and to
// reuse from the scorer. Input is expected to be a lowercase, punycoded
// hostname without a trailing dot (see domain.ts for normalization).
//
// Deliberate strictness: a hostname whose TLD is not in the (ICANN-only) list
// returns null — for this extension an unknown suffix means "not a domain we
// can look up", never "assume the last label is a TLD".

import { PSL_EXACT, PSL_EXCEPTIONS, PSL_WILDCARD } from "./psl-data.ts";

export interface SplitDomain {
  /** The public suffix, e.g. "co.uk". */
  publicSuffix: string;
  /** The suffix plus one label, e.g. "quietharbor.co.uk". */
  registrableDomain: string;
  /** The registrable label alone, e.g. "quietharbor". */
  label: string;
  /** Anything left of the registrable label, "" if none. */
  subdomains: string;
}

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

let exact: Set<string> | undefined;
let wildcard: Set<string> | undefined;
let exceptions: Set<string> | undefined;

function init(): void {
  if (exact) return;
  exact = new Set(PSL_EXACT);
  wildcard = new Set(PSL_WILDCARD);
  exceptions = new Set(PSL_EXCEPTIONS);
}

export function splitDomain(host: string): SplitDomain | null {
  if (host.length > 253) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((l) => LABEL_RE.test(l))) return null;
  init();

  // Walk candidates longest-first; the first hit is the prevailing rule.
  let suffixStart = -1;
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join(".");
    if (exceptions!.has(candidate)) {
      // Exception rule: the public suffix is the rule minus its leftmost label.
      suffixStart = i + 1;
      break;
    }
    if (exact!.has(candidate)) {
      suffixStart = i;
      break;
    }
    if (i + 1 < labels.length && wildcard!.has(labels.slice(i + 1).join("."))) {
      suffixStart = i;
      break;
    }
  }

  // -1: unknown TLD. 0: the whole input is itself a public suffix (e.g. "co.uk").
  if (suffixStart <= 0) return null;

  return {
    publicSuffix: labels.slice(suffixStart).join("."),
    registrableDomain: labels.slice(suffixStart - 1).join("."),
    label: labels[suffixStart - 1]!,
    subdomains: labels.slice(0, suffixStart - 1).join("."),
  };
}
