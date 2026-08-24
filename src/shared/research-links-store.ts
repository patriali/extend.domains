// storage.local access for the research-link toggles. Kept separate from
// research-links.ts so the pure tool table and normalizer stay testable
// without the extension polyfill (mirrors layout.ts / layout-store.ts).

import browser from "webextension-polyfill";
import {
  normalizeResearchLinks,
  RESEARCH_LINKS_KEY,
  type ResearchLinkSettings,
} from "./research-links";

export async function loadResearchLinks(): Promise<ResearchLinkSettings> {
  const stored = await browser.storage.local.get(RESEARCH_LINKS_KEY);
  return normalizeResearchLinks(stored[RESEARCH_LINKS_KEY]);
}

export async function saveResearchLinks(s: ResearchLinkSettings): Promise<void> {
  await browser.storage.local.set({ [RESEARCH_LINKS_KEY]: normalizeResearchLinks(s) });
}

export async function resetResearchLinks(): Promise<void> {
  await browser.storage.local.remove(RESEARCH_LINKS_KEY);
}
