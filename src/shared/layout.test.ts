import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_LAYOUT, mergeLayout, type SectionConfig } from "./layout.ts";

test("undefined/garbage yields the default layout", () => {
  assert.deepEqual(mergeLayout(undefined), DEFAULT_LAYOUT);
  assert.deepEqual(mergeLayout("nonsense"), DEFAULT_LAYOUT);
  assert.deepEqual(mergeLayout(null), DEFAULT_LAYOUT);
});

test("preserves stored order and enabled flags", () => {
  const stored: SectionConfig[] = [
    { id: "dns", enabled: false },
    { id: "score", enabled: true },
  ];
  const merged = mergeLayout(stored);
  assert.deepEqual(merged.slice(0, 2), stored);
  // every known section still present exactly once
  assert.equal(merged.length, DEFAULT_LAYOUT.length);
  assert.equal(new Set(merged.map((s) => s.id)).size, DEFAULT_LAYOUT.length);
});

test("drops unknown ids and de-dupes", () => {
  const merged = mergeLayout([
    { id: "bogus", enabled: true },
    { id: "dns", enabled: false },
    { id: "dns", enabled: true },
  ]);
  assert.equal(merged.filter((s) => s.id === "dns").length, 1);
  assert.equal(merged.find((s) => s.id === "dns")?.enabled, false); // first wins
  assert.ok(!merged.some((s) => (s.id as string) === "bogus"));
});

test("appends sections missing from a stored layout (forward-compat)", () => {
  // A layout saved before "research" existed: it should reappear, enabled.
  const old = DEFAULT_LAYOUT.filter((s) => s.id !== "research");
  const merged = mergeLayout(old);
  assert.ok(merged.some((s) => s.id === "research" && s.enabled));
  assert.equal(merged.length, DEFAULT_LAYOUT.length);
});
