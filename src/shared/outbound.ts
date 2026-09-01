// Tagging for links that leave the extension (research tools, registrar
// searches, Wayback snapshots), so the destination can attribute the referral
// back to us. Pure — no extension imports — so it stays unit-testable.

const UTM_SOURCE = "utm_source=extenddomains.com";

/**
 * Appends the utm_source parameter to a URL's query string, keeping any params
 * it already carries. The fragment is preserved untouched and the param is
 * inserted before it: for a hash-routed target (TMView), appending at the end
 * would bury the tag inside the SPA's own route instead of the real query.
 */
export function withUtm(url: string): string {
  const hash = url.indexOf("#");
  const base = hash === -1 ? url : url.slice(0, hash);
  const frag = hash === -1 ? "" : url.slice(hash);
  return `${base}${base.includes("?") ? "&" : "?"}${UTM_SOURCE}${frag}`;
}
