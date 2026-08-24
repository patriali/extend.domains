import assert from "node:assert/strict";
import { test } from "node:test";
import { pronounceability } from "./pronounce.ts";
import { segmentLabel } from "./segment.ts";
import { scoreDomain } from "./index.ts";

test("segments two clean words", () => {
  const s = segmentLabel("quietharbor");
  assert.deepEqual(s.words, ["quiet", "harbor"]);
  assert.equal(s.coverage, 1);
});

test("camelCase casing splits on the human word boundaries", () => {
  // "cloak" is absent from the wordlist; the DP mis-splits it, but the brand
  // casing gets it right.
  assert.deepEqual(segmentLabel("silkcloak", "SilkCloak").words, ["silk", "cloak"]);
  assert.deepEqual(segmentLabel("domainlanders", "domainLanders").words, ["domain", "landers"]);
  assert.deepEqual(segmentLabel("nuventure", "NuVenture").words, ["nu", "venture"]);
  assert.equal(segmentLabel("silkcloak", "SilkCloak").coverage, 1);
});

test("non-camelCase casing is ignored (falls back to the DP)", () => {
  // all-lower, all-upper, and merely-capitalized carry no word boundary.
  assert.deepEqual(segmentLabel("quietharbor", "quietharbor").words, ["quiet", "harbor"]);
  assert.deepEqual(segmentLabel("quietharbor", "QUIETHARBOR").words, ["quiet", "harbor"]);
  assert.deepEqual(segmentLabel("quietharbor", "Quietharbor").words, ["quiet", "harbor"]);
});

test("prefers one long word over fragments", () => {
  assert.deepEqual(segmentLabel("carpet").words, ["carpet"]);
});

test("digits and hyphens break words and hurt coverage", () => {
  const s = segmentLabel("sunset-app42");
  assert.deepEqual(s.words, ["sunset", "app"]);
  assert.ok(s.coverage < 1); // the "42" is scorable but uncovered
});

test("gibberish has zero-ish coverage", () => {
  assert.equal(segmentLabel("xqzvkj").words.length, 0);
});

test("pronounceability orders English-like above keyboard mash", () => {
  const banana = pronounceability("banana");
  const mash = pronounceability("xzqkvj");
  assert.ok(banana > 0.5, `banana=${banana}`);
  assert.ok(mash < 0.35, `mash=${mash}`);
  assert.ok(banana > mash);
});

test("clean two-word .com scores well", () => {
  const r = scoreDomain({ label: "quietharbor", publicSuffix: "com" });
  assert.ok(r.score >= 65, `score=${r.score}`);
  assert.deepEqual(r.flags, []);
});

test("hyphens and digits drag the score down", () => {
  const clean = scoreDomain({ label: "quietharbor", publicSuffix: "com" });
  const messy = scoreDomain({ label: "quiet-harbor-99", publicSuffix: "com" });
  assert.ok(messy.score < clean.score);
  assert.ok(messy.flags.includes("hyphens"));
  assert.ok(messy.flags.includes("digits"));
});

test("worse TLD scores below .com, all else equal", () => {
  const com = scoreDomain({ label: "quietharbor", publicSuffix: "com" });
  const biz = scoreDomain({ label: "quietharbor", publicSuffix: "biz" });
  assert.ok(biz.score < com.score);
});

test("short names are premium regardless of dictionary words", () => {
  // The complaint: x.com scored low because words/pronounceability were 0.
  for (const label of ["x", "kq", "xyz", "qz", "777"]) {
    const r = scoreDomain({ label, publicSuffix: "com" });
    assert.ok(r.score >= 90, `${label}.com scored ${r.score}, expected premium`);
    // words/pronounceability are dropped from the average, not counted as 0.
    assert.equal(r.components.find((c) => c.id === "words")?.weight, 0);
    assert.equal(r.components.find((c) => c.id === "pronounceability")?.weight, 0);
  }
});

test("shorter premium names outrank slightly longer ones", () => {
  const three = scoreDomain({ label: "kqz", publicSuffix: "com" }).score;
  const four = scoreDomain({ label: "kqzv", publicSuffix: "com" }).score;
  assert.ok(three >= four);
});

test("camelCase caseLabel lifts the words component", () => {
  const plain = scoreDomain({ label: "silkcloak", publicSuffix: "com" });
  const cased = scoreDomain({ label: "silkcloak", publicSuffix: "com", caseLabel: "SilkCloak" });
  assert.deepEqual(cased.features.segmentation.words, ["silk", "cloak"]);
  assert.ok(
    cased.components.find((c) => c.id === "words")!.value >=
      plain.components.find((c) => c.id === "words")!.value,
  );
});

test("short pattern features", () => {
  const r = scoreDomain({ label: "kxvz", publicSuffix: "com" });
  assert.equal(r.features.charClasses, "LLLL");
  const pattern = r.components.find((c) => c.id === "pattern");
  assert.ok(pattern !== undefined && pattern.value > 0);
  assert.equal(scoreDomain({ label: "lame", publicSuffix: "com" }).features.cvPattern, "CVCV");
});

test("IDN is flagged and mildly penalized", () => {
  const r = scoreDomain({
    label: "xn--mnchen-3ya",
    publicSuffix: "de",
    displayLabel: "münchen",
  });
  assert.ok(r.flags.includes("idn"));
  assert.ok(!r.flags.includes("homograph")); // pure-German label, single script
});

test("mixed-script lookalike label is flagged as homograph and tanks", () => {
  // "раураl": Cyrillic р/а/у + Latin l — the classic paypal spoof shape.
  const r = scoreDomain({
    label: "xn--l-7sbqu6bl",
    publicSuffix: "com",
    displayLabel: "раураl",
  });
  assert.ok(r.flags.includes("homograph"));
  assert.ok(r.features.homograph.mixedScript);
  assert.ok(r.features.homograph.confusables.length > 0);
  assert.ok(r.score < 20, `score=${r.score}`);
});
