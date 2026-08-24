import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deobfuscate,
  hasDeobfuscatedCandidate,
  normalizeDeobfuscation,
} from "./deobfuscate.ts";
import { findLastDomainInText } from "./domain.ts";

// Convenience: run deobfuscation like the background does — try each candidate
// through the real PSL validator and return the first ascii host, or null.
function resolve(text: string, spaces = false): string | null {
  for (const candidate of deobfuscate(text, { spaces })) {
    const parsed = findLastDomainInText(candidate);
    if (parsed !== null) return parsed.ascii;
  }
  return null;
}

test("the word 'dot' becomes a dot", () => {
  assert.equal(resolve("example dot com"), "example.com");
  assert.equal(resolve("EXAMPLE DOT COM"), "example.com");
  assert.equal(resolve("sub dot example dot com"), "sub.example.com");
});

test("bracketed and parenthesized dots", () => {
  assert.equal(resolve("example[.]com"), "example.com");
  assert.equal(resolve("example(.)com"), "example.com");
  assert.equal(resolve("example (dot) com"), "example.com");
  assert.equal(resolve("example [dot] com"), "example.com");
});

test("spaced literal dot", () => {
  assert.equal(resolve("example . com"), "example.com");
  assert.equal(resolve("example .com"), "example.com");
  assert.equal(resolve("example. com"), "example.com");
});

test("asterisk noise around the dot", () => {
  assert.equal(resolve("example*.com"), "example.com");
  assert.equal(resolve("example *. com"), "example.com");
});

test("dot-like glyphs (bullet, middot, etc.) count as marked separators", () => {
  // These resolve WITHOUT the plain-space opt-in — they are unambiguous.
  assert.equal(resolve("BlogsAi • com"), "blogsai.com");
  assert.equal(resolve("example·com"), "example.com"); // U+00B7 middle dot
  assert.equal(resolve("example ・ com"), "example.com"); // U+30FB katakana
  assert.equal(resolve("example．com"), "example.com"); // U+FF0E fullwidth stop
  assert.equal(resolve("sub • example • com"), "sub.example.com");
});

test("still requires a real TLD", () => {
  assert.equal(resolve("example dot zzznotatld"), null);
});

test("'dot' inside a word is left alone", () => {
  assert.equal(resolve("anecdote"), null);
  assert.equal(resolve("robotics"), null);
});

test("marked rewrite does not glue unrelated trailing words", () => {
  // The real domain is found; "please" is not welded onto it.
  assert.equal(resolve("check example . com please"), "example.com");
});

test("plain space is off by default", () => {
  assert.equal(resolve("example com"), null);
  assert.deepEqual(deobfuscate("example com"), []);
});

test("plain space resolves only when opted in", () => {
  assert.equal(resolve("example com", true), "example.com");
  assert.equal(resolve("startups io", true), "startups.io");
});

test("plain space accepts the documented false positives", () => {
  // These are the tradeoff the warning calls out — real registrable domains.
  assert.equal(resolve("call me", true), "call.me");
  assert.equal(resolve("log in", true), "log.in");
});

test("plain space still needs a real TLD", () => {
  assert.equal(resolve("read the", true), null); // .the is not a TLD
  assert.equal(resolve("the banana", true), null); // .banana is not a TLD
});

test("returns nothing to rewrite when there is no obfuscation", () => {
  assert.deepEqual(deobfuscate("just some words"), []);
  assert.deepEqual(deobfuscate("example.com"), []); // already dotted
});

test("newlines are not treated as label gaps under plain-space", () => {
  // A space→dot must not span a line break and weld two lines together.
  assert.equal(resolve("example\ncom", true), null);
});

// --- content-script pre-gate ------------------------------------------------

test("hasDeobfuscatedCandidate flags marked separators", () => {
  assert.equal(hasDeobfuscatedCandidate("example dot com"), true);
  assert.equal(hasDeobfuscatedCandidate("example[.]com"), true);
  assert.equal(hasDeobfuscatedCandidate("example*.com"), true);
});

test("hasDeobfuscatedCandidate ignores plain space unless opted in", () => {
  assert.equal(hasDeobfuscatedCandidate("example com"), false);
  assert.equal(hasDeobfuscatedCandidate("example com", { spaces: true }), true);
});

test("hasDeobfuscatedCandidate is false for ordinary prose", () => {
  assert.equal(hasDeobfuscatedCandidate("just some words here"), false);
  // It is only a *shape* pre-gate (no PSL), so a bogus TLD still passes here —
  // the background rejects it. That is acceptable for a cheap gate.
  assert.equal(hasDeobfuscatedCandidate("example dot zzznotatld"), true);
});

// --- settings normalization -------------------------------------------------

test("normalizeDeobfuscation enforces spaces⇒enabled", () => {
  assert.deepEqual(normalizeDeobfuscation({ enabled: true, spaces: true }), {
    enabled: true,
    spaces: true,
  });
  // spaces is meaningless while disabled
  assert.deepEqual(normalizeDeobfuscation({ enabled: false, spaces: true }), {
    enabled: false,
    spaces: false,
  });
});

test("normalizeDeobfuscation copes with garbage/undefined", () => {
  assert.deepEqual(normalizeDeobfuscation(undefined), { enabled: false, spaces: false });
  assert.deepEqual(normalizeDeobfuscation("nope"), { enabled: false, spaces: false });
  assert.deepEqual(normalizeDeobfuscation({}), { enabled: false, spaces: false });
});
