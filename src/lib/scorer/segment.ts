// Word segmentation: splits a label into dictionary words and gaps via
// dynamic programming. Frequency rank breaks ties (common words are cheaper),
// and a per-word base cost makes one long word beat two short ones
// ("carpet", not "car"+"pet").

import { WORDS } from "./wordlist-data.ts";

export interface SegmentPart {
  text: string;
  isWord: boolean;
}

export interface Segmentation {
  parts: SegmentPart[];
  words: string[];
  /** Fraction of letters+digits covered by dictionary words, 0..1. */
  coverage: number;
}

const GAP_COST = 1; // per uncovered character
const WORD_BASE = 0.55;
const RANK_COST = 0.35; // scaled by rank/dictionary size
const SHORT_WORD_PENALTY = 1.1; // extra cost for 2-letter matches ("cl", "ak")

// A real internal case boundary: lower→Upper ("silkCloak") or the end of an
// acronym ("HTMLParser"). A merely-capitalized word ("Silkcloak") has none.
const CASE_BOUNDARY = /\p{Ll}\p{Lu}|\p{Lu}\p{Lu}\p{Ll}/u;
const CAMEL_TOKEN = /\p{Lu}+(?=\p{Lu}\p{Ll})|\p{Lu}?\p{Ll}+|\p{Lu}+|\p{N}+/gu;

let dict: Map<string, number> | null = null;
let maxWordLen = 0;

function getDict(): Map<string, number> {
  if (dict === null) {
    dict = new Map();
    for (let i = 0; i < WORDS.length; i++) {
      const w = WORDS[i]!;
      if (!dict.has(w)) dict.set(w, i);
      if (w.length > maxWordLen) maxWordLen = w.length;
    }
  }
  return dict;
}

/**
 * @param cased Optional original-case form of the label. When it carries a real
 *   camelCase/PascalCase boundary (SilkCloak, domainLanders) the human-authored
 *   word split is trusted directly, which is far more reliable than the
 *   dictionary DP. Otherwise (all-lower, all-upper, just-capitalized) it's
 *   ignored and the DP runs on the lowercase label as before.
 */
export function segmentLabel(label: string, cased?: string): Segmentation {
  const camel = cased !== undefined ? splitCamelCase(cased) : null;
  if (camel !== null) {
    const parts = camel.map((t) => ({ text: t.toLowerCase(), isWord: true }));
    return { parts, words: parts.map((p) => p.text), coverage: 1 };
  }

  const parts: SegmentPart[] = [];
  const words: string[] = [];
  let covered = 0;
  let scorable = 0;

  // Digits and hyphens are natural separators, never parts of words; only
  // alphabetic runs go through the DP. Hyphens don't count against coverage.
  const tokens = label.toLowerCase().match(/[a-z]+|[^a-z]+/g) ?? [];
  for (const tok of tokens) {
    if (!/^[a-z]/.test(tok)) {
      parts.push({ text: tok, isWord: false });
      scorable += tok.replace(/-/g, "").length;
      continue;
    }
    scorable += tok.length;
    for (const part of segmentAlphaRun(tok)) {
      parts.push(part);
      if (part.isWord) {
        words.push(part.text);
        covered += part.text.length;
      }
    }
  }

  return { parts, words, coverage: scorable === 0 ? 0 : covered / scorable };
}

function splitCamelCase(cased: string): string[] | null {
  if (!CASE_BOUNDARY.test(cased)) return null;
  const tokens = cased.match(CAMEL_TOKEN);
  return tokens !== null && tokens.length >= 2 ? tokens : null;
}

function segmentAlphaRun(s: string): SegmentPart[] {
  const d = getDict();
  const n = s.length;
  const cost = new Array<number>(n + 1).fill(Infinity);
  const back = new Array<{ from: number; isWord: boolean } | undefined>(n + 1);
  cost[0] = 0;

  for (let i = 0; i < n; i++) {
    const here = cost[i]!;
    if (here === Infinity) continue;
    if (here + GAP_COST < cost[i + 1]!) {
      cost[i + 1] = here + GAP_COST;
      back[i + 1] = { from: i, isWord: false };
    }
    const limit = Math.min(maxWordLen, n - i);
    for (let len = 2; len <= limit; len++) {
      const rank = d.get(s.slice(i, i + len));
      if (rank === undefined) continue;
      const shortPenalty = len === 2 ? SHORT_WORD_PENALTY : 0;
      const c = here + WORD_BASE + shortPenalty + RANK_COST * (rank / WORDS.length);
      if (c < cost[i + len]!) {
        cost[i + len] = c;
        back[i + len] = { from: i, isWord: true };
      }
    }
  }

  const raw: SegmentPart[] = [];
  let at = n;
  while (at > 0) {
    const b = back[at]!;
    raw.push({ text: s.slice(b.from, at), isWord: b.isWord });
    at = b.from;
  }
  raw.reverse();

  // Merge runs of single-character gaps into one part.
  const parts: SegmentPart[] = [];
  for (const p of raw) {
    const prev = parts[parts.length - 1];
    if (prev !== undefined && !prev.isWord && !p.isWord) prev.text += p.text;
    else parts.push({ ...p });
  }
  return parts;
}
