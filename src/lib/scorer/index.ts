// Local domain scorer — pure, standalone, no extension imports anywhere in
// src/lib/scorer. Entry point: scoreDomain(). Tune weights.ts, not this file.

import { extractFeatures, type LabelFeatures } from "./features.ts";
import { DEFAULT_WEIGHTS, type ScorerWeights } from "./weights.ts";

export type { LabelFeatures, HomographFlags } from "./features.ts";
export type { Segmentation, SegmentPart } from "./segment.ts";
export { DEFAULT_WEIGHTS, type ScorerWeights } from "./weights.ts";

export interface ScoreInput {
  /** Registrable label, ascii/punycode form, e.g. "quietharbor". */
  label: string;
  /** Public suffix, e.g. "co.uk". */
  publicSuffix: string;
  /** Unicode form of the label if it differs (IDN). */
  displayLabel?: string;
  /** Original-case label (SilkCloak) for camelCase word splitting. */
  caseLabel?: string;
}

export interface ScoreComponent {
  id: "length" | "words" | "pronounceability" | "composition" | "tld" | "pattern";
  /** Component value, 0..1, before weighting. */
  value: number;
  weight: number;
  /** Contribution to the 0..100 score (pre-penalty). */
  points: number;
}

export interface ScoreResult {
  /** 0..100. */
  score: number;
  components: ScoreComponent[];
  /** Multiplier applied after the weighted sum (1 = none). */
  penaltyMultiplier: number;
  /** Human-facing caveats: "hyphens", "digits", "idn", "homograph". */
  flags: string[];
  features: LabelFeatures;
}

export function scoreDomain(input: ScoreInput, w: ScorerWeights = DEFAULT_WEIGHTS): ScoreResult {
  const f = extractFeatures(input.label, input.displayLabel, input.caseLabel);

  const values: Record<ScoreComponent["id"], number> = {
    length: lengthValue(f.length, w),
    words: wordsValue(f, w),
    pronounceability: f.pronounceability,
    // All-digit labels are a category (NNN.com), not digits sprinkled into a
    // word — the digit penalty (like the "digits" flag) doesn't apply to them.
    composition: f.allDigits
      ? Math.max(0, 1 - f.hyphenCount * w.hyphenPenalty)
      : Math.max(0, 1 - f.hyphenCount * w.hyphenPenalty - f.digitCount * w.digitPenalty),
    tld: w.tldScores[input.publicSuffix] ?? w.defaultTldScore,
    pattern: patternValue(f),
  };

  // Very short all-letter/all-digit names are premium regardless of whether
  // they parse into dictionary words, so drop the two components that would
  // otherwise zero them out and renormalize over what's left.
  const shortPremium =
    w.shortPremiumMaxLen > 0 &&
    (f.allLetters || f.allDigits) &&
    f.length <= w.shortPremiumMaxLen;
  const inactive: ReadonlySet<ScoreComponent["id"]> = shortPremium
    ? new Set(["words", "pronounceability"])
    : new Set();

  const totalWeight = (Object.keys(values) as ScoreComponent["id"][])
    .filter((id) => !inactive.has(id))
    .reduce((sum, id) => sum + w.weights[id], 0);
  const components = (Object.keys(values) as ScoreComponent["id"][]).map((id) => {
    const active = !inactive.has(id) && totalWeight > 0;
    return {
      id,
      value: values[id],
      weight: active ? w.weights[id] : 0,
      points: active ? (100 * values[id] * w.weights[id]) / totalWeight : 0,
    };
  });
  const base = components.reduce((sum, c) => sum + c.points, 0);

  const flags: string[] = [];
  if (f.hyphenCount > 0) flags.push("hyphens");
  if (f.digitCount > 0 && !f.allDigits) flags.push("digits");
  let penaltyMultiplier = 1;
  if (f.homograph.isIdn) {
    flags.push("idn");
    penaltyMultiplier *= 1 - w.idnPenalty;
  }
  if (f.homograph.mixedScript || f.homograph.confusables.length > 0) {
    flags.push("homograph");
    penaltyMultiplier *= 1 - w.homographPenalty;
  }

  return {
    score: Math.round(base * penaltyMultiplier),
    components,
    penaltyMultiplier,
    flags,
    features: f,
  };
}

function lengthValue(len: number, w: ScorerWeights): number {
  if (len <= w.idealLength) return 1;
  if (len >= w.maxLength) return 0;
  return 1 - (len - w.idealLength) / (w.maxLength - w.idealLength);
}

function wordsValue(f: LabelFeatures, w: ScorerWeights): number {
  const count = f.segmentation.words.length;
  if (count === 0) return 0;
  const factor = w.wordCountFactors[Math.min(count - 1, w.wordCountFactors.length - 1)] ?? 0;
  return f.segmentation.coverage * factor;
}

/** Short uniform patterns (LLL, LLLL, NNN, NNNN) trade in their own market. */
function patternValue(f: LabelFeatures): number {
  if (!f.allLetters && !f.allDigits) return 0;
  if (f.length <= 3) return 1;
  if (f.length === 4) return 0.7;
  return 0;
}
