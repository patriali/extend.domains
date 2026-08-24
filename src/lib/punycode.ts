// Punycode decoding (RFC 3492), decode-only — enough to turn an "xn--" label
// back into unicode for display and homograph inspection. Pure module.

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = Math.floor(delta / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
}

function digitValue(ch: string): number | null {
  const c = ch.charCodeAt(0);
  if (c >= 97 && c <= 122) return c - 97; // a-z → 0..25
  if (c >= 48 && c <= 57) return c - 48 + 26; // 0-9 → 26..35
  return null;
}

/**
 * Decodes one hostname label. Non-"xn--" labels pass through unchanged;
 * returns null if the label claims to be punycode but doesn't decode.
 */
export function decodePunycodeLabel(label: string): string | null {
  const lower = label.toLowerCase();
  if (!lower.startsWith("xn--")) return label;
  const input = lower.slice(4);

  const lastDelim = input.lastIndexOf("-");
  const output: number[] = [];
  if (lastDelim > 0) {
    for (const ch of input.slice(0, lastDelim)) {
      const c = ch.charCodeAt(0);
      if (c >= 128) return null;
      output.push(c);
    }
  }

  let i = 0;
  let n = INITIAL_N;
  let bias = INITIAL_BIAS;
  let index = lastDelim >= 0 ? lastDelim + 1 : 0;

  while (index < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) return null;
      const digit = digitValue(input[index]!);
      index++;
      if (digit === null) return null;
      i += digit * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
    }
    const numPoints = output.length + 1;
    bias = adapt(i - oldi, numPoints, oldi === 0);
    n += Math.floor(i / numPoints);
    if (n > 0x10ffff) return null;
    i %= numPoints;
    output.splice(i, 0, n);
    i++;
  }

  return String.fromCodePoint(...output);
}

/** Decodes every label of an ascii hostname for display; falls back per-label. */
export function toUnicodeHost(asciiHost: string): string {
  return asciiHost
    .split(".")
    .map((l) => decodePunycodeLabel(l) ?? l)
    .join(".");
}
