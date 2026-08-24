// All tunable numbers for the local score live here — edit this file to
// change how domains are rated; the mechanics stay in the other modules.
//
// The final score is a weighted average of the component values (each 0..1)
// times 100, then multiplied by any applicable penalty multipliers.

export interface ScorerWeights {
  /** Relative weight of each component (they are normalized by their sum). */
  weights: {
    /** Shorter labels score higher. */
    length: number;
    /** Dictionary-word coverage of the label. */
    words: number;
    /** English-likeness of the letter sequence. */
    pronounceability: number;
    /** Penalizes hyphens and digits. */
    composition: number;
    /** TLD desirability. */
    tld: number;
    /** Bonus lane for short LLL/LLLL/NNN/NNNN-style patterns. */
    pattern: number;
  };

  /** Label length ≤ idealLength scores 1.0; decays linearly to 0 at maxLength. */
  idealLength: number;
  maxLength: number;

  /**
   * All-letter or all-digit labels this short are "premium regardless" (x.com,
   * kq.com, 777.com): the words/pronounceability components are dropped from
   * the average so a non-dictionary short name isn't dragged down. Set to 0 to
   * disable.
   */
  shortPremiumMaxLen: number;

  /** Composition value = 1 − hyphens×hyphenPenalty − digits×digitPenalty (floor 0). */
  hyphenPenalty: number;
  digitPenalty: number;

  /**
   * Words value = segmentation coverage × wordCountFactors[words − 1]
   * (last entry reused past the end): one or two clean words is ideal,
   * four-word pileups are not.
   */
  wordCountFactors: number[];

  /** TLD component values, 0..1; anything unlisted gets defaultTldScore. */
  tldScores: Record<string, number>;
  defaultTldScore: number;

  /** Multiplier penalties, 0..1 (0 = no penalty, 0.9 = nearly zero the score). */
  idnPenalty: number;
  /** Applied when mixed scripts or lookalike characters are detected. */
  homographPenalty: number;
}

export const DEFAULT_WEIGHTS: ScorerWeights = {
  weights: {
    length: 20,
    words: 22,
    pronounceability: 14,
    composition: 16,
    tld: 20,
    pattern: 8,
  },

  idealLength: 6,
  maxLength: 20,
  shortPremiumMaxLen: 4,

  hyphenPenalty: 0.35,
  digitPenalty: 0.2,

  wordCountFactors: [1, 1, 0.75, 0.5],

  tldScores: {
    com: 1,
    net: 0.7,
    org: 0.7,
    io: 0.75,
    co: 0.7,
    ai: 0.85,
    app: 0.65,
    dev: 0.6,
    xyz: 0.4,
    info: 0.35,
    biz: 0.3,
  },
  defaultTldScore: 0.45,

  idnPenalty: 0.15,
  homographPenalty: 0.8,
};
