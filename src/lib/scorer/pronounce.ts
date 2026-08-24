// Pronounceability: average letter-bigram log-probability under the model
// generated from the wordlist (with ^/$ boundary markers), mapped onto 0..1.

import { BIGRAM_LOG2 } from "./wordlist-data.ts";

const N = 28;

// Calibration endpoints for the linear map from average log2 probability to
// 0..1. English-like sequences sit around −3; keyboard mash sits below −7.
const LOG2_FLOOR = -8;
const LOG2_CEIL = -2.8;

function idx(ch: string): number {
  if (ch === "^") return 0;
  if (ch === "$") return 27;
  return ch.charCodeAt(0) - 97 + 1;
}

/** Raw average bigram log2 probability over the alphabetic runs of `text`. */
export function bigramLog2Avg(text: string): number | null {
  const runs = (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((r) => r.length >= 2);
  if (runs.length === 0) return null;
  let sum = 0;
  let transitions = 0;
  for (const run of runs) {
    const path = `^${run}$`;
    for (let i = 0; i < path.length - 1; i++) {
      sum += BIGRAM_LOG2[idx(path[i]!) * N + idx(path[i + 1]!)]!;
      transitions++;
    }
  }
  return sum / transitions;
}

/** 0 (unpronounceable) .. 1 (English-like); 0 for labels with no letter runs. */
export function pronounceability(text: string): number {
  const avg = bigramLog2Avg(text);
  if (avg === null) return 0;
  return Math.min(1, Math.max(0, (avg - LOG2_FLOOR) / (LOG2_CEIL - LOG2_FLOOR)));
}
