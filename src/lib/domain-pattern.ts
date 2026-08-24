// Tiny shared pre-gate for "could this selection be a domain?". This is the
// only lib module the content script bundles (it runs on every page, so it
// must stay small — full PSL validation happens in the background, which has
// the suffix data loaded once instead of per-page).

/**
 * Bare domain shape: dotted labels, letters/digits/hyphens, and a TLD that is
 * either alphabetic or a punycode label. Rejects IPs (numeric TLD), URLs and
 * anything with spaces. Case-insensitive; allows one trailing dot.
 */
export const DOMAIN_PATTERN =
  /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:xn--[a-z0-9-]{2,}|\p{L}{2,})\.?$/iu;

/**
 * Same shape as DOMAIN_PATTERN but unanchored and global, for finding domain
 * runs *inside* free text (e.g. a domain highlighted mid-sentence). Optionally
 * consumes a leading scheme; stops at the host (path/query excluded). Matches
 * are candidates only — the background still PSL-validates each one.
 */
export const DOMAIN_SCAN =
  /(?:https?:\/\/)?(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:xn--[a-z0-9-]{2,}|\p{L}{2,})/giu;

/** Cheap presence test used by the content script (no PSL). */
export function hasDomainCandidate(text: string): boolean {
  return text.match(DOMAIN_SCAN) !== null;
}

/** Strips wrapping punctuation/quotes a selection tends to pick up. */
export function stripWrapping(text: string): string {
  return text
    .replace(/^[\s"'“”‘’(<\[{]+/u, "")
    .replace(/[\s"'“”‘’)>\]}.,;:!?]+$/u, "");
}
