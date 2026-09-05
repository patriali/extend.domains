// Host permission origins for the data sources. Keep in sync with the
// host_permissions list generated in build.mjs.
//
// Firefox MV3 grants none of these at install — host permissions and content
// script matches are both opt-in there — so every context that reports a
// blocked source also has to offer a way to ask for them.

import browser from "webextension-polyfill";

export const DOH_ORIGINS = ["https://cloudflare-dns.com/*", "https://dns.google/*"];

/** Everything a full lookup needs: the DoH resolvers, plus site access, which
 * is what carries the metadata fetch, the Wayback lookup, and RDAP. */
export const ALL_ORIGINS = [...DOH_ORIGINS, "<all_urls>"];

/** Whether the given origins are granted. A rejection reads as "not granted" —
 * the caller's next move (offer the grant) is the same either way. */
export async function hasAccess(origins: string[]): Promise<boolean> {
  return browser.permissions.contains({ origins }).catch(() => false);
}
