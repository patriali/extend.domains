import assert from "node:assert/strict";
import { test } from "node:test";
import {
  enabledResearchTools,
  normalizeResearchLinks,
  RESEARCH_TOOLS,
  researchToolUrl,
} from "./research-links.ts";

test("undefined/garbage yields each tool's own default", () => {
  for (const stored of [undefined, null, 42, "nope"]) {
    const s = normalizeResearchLinks(stored);
    for (const tool of RESEARCH_TOOLS) assert.equal(s[tool.id], tool.defaultEnabled);
  }
});

test("stored flags win, unknown ids are dropped", () => {
  const s = normalizeResearchLinks({ atom: false, ahrefs: true, bogus: true });
  assert.equal(s["atom"], false);
  assert.equal(s["ahrefs"], true);
  assert.ok(!("bogus" in s));
});

test("a tool absent from a stored map keeps its default (forward-compat)", () => {
  // A map saved before "ahrefs" existed: it stays off, not silently shown.
  const s = normalizeResearchLinks({ atom: true });
  assert.equal(s["ahrefs"], false);
});

test("enabled list follows declaration order", () => {
  const on = enabledResearchTools(normalizeResearchLinks(undefined)).map((t) => t.id);
  assert.deepEqual(on, RESEARCH_TOOLS.filter((t) => t.defaultEnabled).map((t) => t.id));
  assert.ok(!on.includes("ahrefs"));
});

test("url scope picks the domain or the bare label", () => {
  const d = { registrableDomain: "quiet harbor.com", label: "quiet harbor" };
  const byId = Object.fromEntries(RESEARCH_TOOLS.map((t) => [t.id, t]));
  assert.equal(
    researchToolUrl(byId["ahrefs"]!, d),
    "https://ahrefs.com/backlink-checker/?input=quiet%20harbor.com&mode=subdomains",
  );
  assert.equal(researchToolUrl(byId["dotdb"]!, d), "https://dotdb.com/search?keyword=quiet%20harbor&position=any");
});
