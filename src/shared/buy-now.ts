// storage.local access for the "Buy now" button toggle. Kept separate from
// lib/marketplace.ts so the pure detection and its normalizer stay testable
// without the extension polyfill (mirrors research-links.ts / -store.ts).

import browser from "webextension-polyfill";
import { BUY_NOW_KEY, normalizeBuyNow } from "../lib/marketplace";

export { BUY_NOW_KEY };

export async function loadBuyNow(): Promise<boolean> {
  const stored = await browser.storage.local.get(BUY_NOW_KEY);
  return normalizeBuyNow(stored[BUY_NOW_KEY]);
}

export async function saveBuyNow(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [BUY_NOW_KEY]: enabled });
}
