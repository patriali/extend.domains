// storage.local access for the sidebar layout. Kept separate from layout.ts
// so the pure merge logic stays testable without the extension polyfill.

import browser from "webextension-polyfill";
import { LAYOUT_STORAGE_KEY, mergeLayout, type SectionConfig } from "./layout";

export async function loadLayout(): Promise<SectionConfig[]> {
  const stored = await browser.storage.local.get(LAYOUT_STORAGE_KEY);
  return mergeLayout(stored[LAYOUT_STORAGE_KEY]);
}

export async function saveLayout(list: SectionConfig[]): Promise<void> {
  await browser.storage.local.set({ [LAYOUT_STORAGE_KEY]: list });
}

export async function resetLayout(): Promise<void> {
  await browser.storage.local.remove(LAYOUT_STORAGE_KEY);
}
