// Feature extraction for one registrable label. Pure functions; the actual
// point assignment happens in index.ts against weights.ts.

import { bigramLog2Avg, pronounceability } from "./pronounce.ts";
import { segmentLabel, type Segmentation } from "./segment.ts";

export interface HomographFlags {
  isIdn: boolean;
  /** Letters from more than one script (e.g. Latin + Cyrillic) — classic spoof shape. */
  mixedScript: boolean;
  /** Non-ASCII characters that are well-known Latin lookalikes. */
  confusables: string[];
}

export interface LabelFeatures {
  label: string;
  /** Unicode form of the label (differs from `label` only for IDNs). */
  displayLabel: string;
  length: number;
  hyphenCount: number;
  digitCount: number;
  allLetters: boolean;
  allDigits: boolean;
  /** One class per char: L(etter), N(umber), H(yphen) — e.g. "LLLL". */
  charClasses: string;
  /** Consonant/vowel shape for all-letter labels ≤ 8 chars, e.g. "CVCV". */
  cvPattern: string | null;
  segmentation: Segmentation;
  /** 0..1, from the bigram model. */
  pronounceability: number;
  /** Raw average bigram log2 probability (null if no letter runs) — for tuning. */
  bigramLog2Avg: number | null;
  homograph: HomographFlags;
}

// Well-known non-ASCII characters that render close enough to Latin letters
// to be used in spoofs. Deliberately conservative: flagging half of Unicode
// would make the flag meaningless.
const CONFUSABLES = new Set([
  // Cyrillic
  "а", "е", "о", "р", "с", "у", "х", "ѕ", "і", "ј", "һ", "ԛ", "ԝ", "ӏ", "г", "ԁ",
  // Greek
  "ο", "ν", "ι", "υ", "ρ", "α", "τ", "κ",
]);

const SCRIPT_RES: Array<[string, RegExp]> = [
  ["Latin", /\p{Script=Latin}/u],
  ["Cyrillic", /\p{Script=Cyrillic}/u],
  ["Greek", /\p{Script=Greek}/u],
  ["Han", /\p{Script=Han}/u],
  ["Arabic", /\p{Script=Arabic}/u],
  ["Hebrew", /\p{Script=Hebrew}/u],
  ["Hangul", /\p{Script=Hangul}/u],
];

export function homographFlags(asciiLabel: string, displayLabel: string): HomographFlags {
  const isIdn = asciiLabel.startsWith("xn--");
  const scripts = new Set<string>();
  const confusables: string[] = [];
  for (const ch of displayLabel) {
    if (!/\p{L}/u.test(ch)) continue;
    const named = SCRIPT_RES.find(([, re]) => re.test(ch));
    scripts.add(named !== undefined ? named[0] : "Other");
    if (ch.charCodeAt(0) > 127 && CONFUSABLES.has(ch)) confusables.push(ch);
  }
  return { isIdn, mixedScript: scripts.size > 1, confusables };
}

export function extractFeatures(
  asciiLabel: string,
  displayLabel?: string,
  caseLabel?: string,
): LabelFeatures {
  const label = asciiLabel.toLowerCase();
  const display = displayLabel ?? label;
  const chars = [...label];

  const hyphenCount = chars.filter((c) => c === "-").length;
  const digitCount = chars.filter((c) => c >= "0" && c <= "9").length;
  const letterCount = chars.length - hyphenCount - digitCount;
  const allLetters = letterCount === chars.length && chars.length > 0;
  const allDigits = digitCount === chars.length && chars.length > 0;

  const charClasses = chars
    .map((c) => (c === "-" ? "H" : c >= "0" && c <= "9" ? "N" : "L"))
    .join("");

  const VOWELS = new Set(["a", "e", "i", "o", "u"]);
  const cvPattern =
    allLetters && chars.length <= 8 && !label.startsWith("xn--")
      ? chars.map((c) => (VOWELS.has(c) ? "V" : "C")).join("")
      : null;

  return {
    label,
    displayLabel: display,
    length: chars.length,
    hyphenCount,
    digitCount,
    allLetters,
    allDigits,
    charClasses,
    cvPattern,
    segmentation: segmentLabel(label, caseLabel),
    pronounceability: pronounceability(label),
    bigramLog2Avg: bigramLog2Avg(label),
    homograph: homographFlags(label, display),
  };
}
