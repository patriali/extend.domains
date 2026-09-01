// Marketplace detection for the sidebar's "Buy now" call to action. Pure module.
//
// Atom only, for now. ns1/ns2.atom.com serve listed names exclusively, so the
// delegation is the whole verdict — no page fetch or probe needed. Spaceship
// was considered and dropped: launch*.spaceship.net is the default DNS for
// every domain registered there, sold or not, so it can't tell a listing from
// an ordinary customer site.
//
// There is deliberately no "is this listing real?" HTTP probe: Atom sits behind
// a Cloudflare bot challenge that answers 403 to every non-browser client (its
// own homepage included) and sends no CORS headers, so a probe could not tell a
// live listing from a dead one.
//
// Unlike the research links (see shared/research-links.ts, nominative only, no
// referral codes), this URL carries a referral ID on purpose: it is a checkout
// call to action rather than a research tool.

/** A marketplace we hold a checkout link for. */
export type MarketplaceId = "atom";

const NS_PATTERNS: Array<[RegExp, MarketplaceId]> = [[/(^|\.)atom\.com$/, "atom"]];

const CHECKOUT: Record<MarketplaceId, (domain: string) => string> = {
  atom: (d) => `https://www.atom.com/name/${d}/rm/YwFgYcLYnG`,
};

/** Marketplace this name is listed on, from its delegation, or null. */
export function marketplaceFromNs(nsHosts: string[]): MarketplaceId | null {
  for (const raw of nsHosts) {
    const ns = raw.toLowerCase().replace(/\.$/, "");
    for (const [re, id] of NS_PATTERNS) {
      if (re.test(ns)) return id;
    }
  }
  return null;
}

/** Checkout URL for the full registrable domain (the listing path takes the TLD). */
export function buyNowUrl(id: MarketplaceId, ascii: string): string {
  return CHECKOUT[id](encodeURIComponent(ascii));
}

/** Display name for the button label. */
export const MARKETPLACE_NAMES: Record<MarketplaceId, string> = {
  atom: "Atom.com",
};

// ── Setting ─────────────────────────────────────────────────────────────────
// Key and normalizer live here (pure) so they stay unit-testable; the
// storage.local wrapper is shared/buy-now.ts. Mirrors the
// lib/deobfuscate.ts ↔ shared/deobfuscation.ts split.

export const BUY_NOW_KEY = "buyNow";

/** On unless the user has explicitly turned it off — anything unset, or
 * garbage from a hand-edited store, reads as on. */
export function normalizeBuyNow(v: unknown): boolean {
  return typeof v === "boolean" ? v : true;
}
