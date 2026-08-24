// De-obfuscation: turns the "anti-linkified" domain spellings people use on
// social media so a post won't auto-link — "example dot com", "example[.]com",
// "example (dot) com", "example*.com" — back into a plain dotted host that the
// normal PSL pipeline can validate. Pure module: no extension imports, so it
// unit-tests under plain Node *and* is safe to bundle into the per-page content
// script (unlike shared/deobfuscation.ts, which pulls in the polyfill). The
// storage wrapper lives in shared/deobfuscation.ts; the settings *shape* lives
// here so every context can share it.
//
// This never decides a match on its own: it only rewrites separators and hands
// the result back to the existing PSL validator, so a real TLD is still
// required — "example dot zzz" resolves to nothing.

import { hasDomainCandidate } from "./domain-pattern.ts";

export interface DeobfuscateOptions {
  /** Also treat a plain space between labels as a dot ("example com"). Noisy —
   * many ordinary phrases end in a ccTLD word ("call me" → call.me) — so it is
   * a separate opt-in from the marked-separator rewrite. */
  spaces?: boolean;
}

/** Opt-in detection settings (persisted by shared/deobfuscation.ts). */
export interface DeobfuscationSettings {
  /** Rewrite marked separators (the word "dot", "[.]", spaced dots, "*."). */
  enabled: boolean;
  /** Also treat a plain space between labels as a dot. Requires `enabled`. */
  spaces: boolean;
}

export const DEOBFUSCATION_KEY = "deobfuscation";

export const DEFAULT_DEOBFUSCATION: DeobfuscationSettings = {
  enabled: false,
  spaces: false,
};

/** Coerces stored/unknown input to valid settings, enforcing the invariant
 * that `spaces` is only meaningful while `enabled`. */
export function normalizeDeobfuscation(v: unknown): DeobfuscationSettings {
  const o = (v ?? {}) as Partial<DeobfuscationSettings>;
  const enabled = o.enabled === true;
  return { enabled, spaces: enabled && o.spaces === true };
}

// Dot-like glyphs people substitute for "." so a post won't auto-link — bullet,
// middle dot, katakana middle dots, one-dot leader, bullet/dot operators, and
// the fullwidth full stop. Treated as marked separators (unambiguous, like the
// word "dot"), so they resolve without the noisier plain-space opt-in.
const DOT_CHARS = ".•·‧․∙⋅・．･";

// A single obfuscated dot: the word "dot" or one of the dot-like glyphs above,
// optionally hugged by brackets, asterisks, and whitespace. Consuming the
// surrounding whitespace is what turns "example . com", "example • com" and
// "example dot com" into "example.com" without gluing genuinely separate words
// together. The word needs boundaries (\bdot\b) so "anecdote" and "robot" are
// left alone.
const OBFUSCATED_DOT = new RegExp(
  `\\s*[[({<*]*\\s*(?:\\bdot\\b|[${DOT_CHARS}])\\s*[)\\]}>*]*\\s*`,
  "gi",
);

// A run of horizontal whitespace (never a newline) sitting between two label
// characters. A lookahead keeps the trailing char unconsumed so consecutive
// gaps ("a b c") all rewrite in one pass.
const LABEL_GAP = /([\p{L}\p{N}-])[^\S\r\n]+(?=[\p{L}\p{N}])/gu;

/**
 * Candidate normalized strings to try, most-conservative first. The caller
 * feeds each to the PSL validator and takes the first that yields a domain, so
 * the marked-separator rewrite is always preferred over the noisier plain-space
 * one. Returns `[]` when nothing was rewritten (input had no obfuscation, or
 * plain-space is off and there were no markers).
 */
export function deobfuscate(text: string, opts: DeobfuscateOptions = {}): string[] {
  const candidates: string[] = [];
  const marked = text.replace(OBFUSCATED_DOT, ".");
  if (marked !== text) candidates.push(marked);
  if (opts.spaces) {
    const spaced = marked.replace(LABEL_GAP, "$1.");
    if (spaced !== marked && spaced !== text) candidates.push(spaced);
  }
  return candidates;
}

/**
 * Cheap pre-gate for the content script: does de-obfuscating this text produce
 * anything domain-shaped? Regex-only (no PSL) — a positive here just means "let
 * the background take a proper look". Mirrors hasDomainCandidate's role for the
 * plain path.
 */
export function hasDeobfuscatedCandidate(text: string, opts: DeobfuscateOptions = {}): boolean {
  return deobfuscate(text, opts).some(hasDomainCandidate);
}
