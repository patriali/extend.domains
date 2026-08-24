// Scorer weights persistence. The scorer itself stays pure (weights are an
// argument); this is the one place that knows they live in storage.local.
// Stored values are merged over DEFAULT_WEIGHTS so fields added in later
// versions pick up their defaults instead of being undefined.

import browser from "webextension-polyfill";
import { DEFAULT_WEIGHTS, type ScorerWeights } from "../lib/scorer";

export const WEIGHTS_STORAGE_KEY = "scorerWeights";

export function mergeWeights(stored: Partial<ScorerWeights> | undefined): ScorerWeights {
  if (stored === undefined) return DEFAULT_WEIGHTS;
  return {
    ...DEFAULT_WEIGHTS,
    ...stored,
    weights: { ...DEFAULT_WEIGHTS.weights, ...(stored.weights ?? {}) },
    tldScores: stored.tldScores ?? DEFAULT_WEIGHTS.tldScores,
    wordCountFactors: stored.wordCountFactors ?? DEFAULT_WEIGHTS.wordCountFactors,
  };
}

export async function loadWeights(): Promise<ScorerWeights> {
  const stored = await browser.storage.local.get(WEIGHTS_STORAGE_KEY);
  return mergeWeights(stored[WEIGHTS_STORAGE_KEY] as Partial<ScorerWeights> | undefined);
}

export async function saveWeights(weights: ScorerWeights): Promise<void> {
  await browser.storage.local.set({ [WEIGHTS_STORAGE_KEY]: weights });
}

export async function resetWeights(): Promise<void> {
  await browser.storage.local.remove(WEIGHTS_STORAGE_KEY);
}
