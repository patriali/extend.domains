// Storage wrapper for the opt-in "detect obfuscated domains" setting, persisted
// in storage.local (mirrors shared/theme.ts). The settings *shape* and its
// normalizer live in the pure lib/deobfuscate.ts so the content script can share
// them without pulling in the polyfill; this module only adds load/save. The
// de-obfuscation is applied in background/index.ts and gated in the content
// script.

import browser from "webextension-polyfill";
import {
  DEFAULT_DEOBFUSCATION,
  DEOBFUSCATION_KEY,
  type DeobfuscationSettings,
  normalizeDeobfuscation,
} from "../lib/deobfuscate";

export {
  DEFAULT_DEOBFUSCATION,
  DEOBFUSCATION_KEY,
  type DeobfuscationSettings,
  normalizeDeobfuscation,
};

export async function loadDeobfuscation(): Promise<DeobfuscationSettings> {
  const stored = await browser.storage.local.get(DEOBFUSCATION_KEY);
  return normalizeDeobfuscation(stored[DEOBFUSCATION_KEY]);
}

export async function saveDeobfuscation(s: DeobfuscationSettings): Promise<void> {
  await browser.storage.local.set({ [DEOBFUSCATION_KEY]: normalizeDeobfuscation(s) });
}
