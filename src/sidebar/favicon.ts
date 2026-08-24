// Favicon divergence adapter (spec §5). Chrome: the "favicon" permission
// exposes the browser's own favicon cache at /_favicon/ — no network from
// us. Firefox has no such API; the <img> points at the site's /favicon.ico
// and the caller hides the img on error.

import browser from "webextension-polyfill";

export function faviconUrl(asciiDomain: string): string {
  if (__TARGET__ === "chrome") {
    const page = encodeURIComponent(`https://${asciiDomain}/`);
    return browser.runtime.getURL(`_favicon/?pageUrl=${page}&size=32`);
  }
  return `https://${asciiDomain}/favicon.ico`;
}
