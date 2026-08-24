// Lookup history: last N domains, storage.local, most-recent-first, deduped
// by ascii host. Background writes on each lookup; the sidebar reads it and
// re-renders via storage.onChanged.

import browser from "webextension-polyfill";

export interface HistoryEntry {
  ascii: string;
  display: string;
  at: number;
}

export const HISTORY_KEY = "lookupHistory";
const MAX_ENTRIES = 12;

export async function readHistory(): Promise<HistoryEntry[]> {
  const stored = await browser.storage.local.get(HISTORY_KEY);
  const list = stored[HISTORY_KEY];
  return Array.isArray(list) ? (list as HistoryEntry[]) : [];
}

export async function pushHistory(entry: { ascii: string; display: string }): Promise<void> {
  const list = await readHistory();
  const next = [
    { ...entry, at: Date.now() },
    ...list.filter((e) => e.ascii !== entry.ascii),
  ].slice(0, MAX_ENTRIES);
  await browser.storage.local.set({ [HISTORY_KEY]: next });
}

export async function clearHistory(): Promise<void> {
  await browser.storage.local.remove(HISTORY_KEY);
}
