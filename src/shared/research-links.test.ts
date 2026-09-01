import assert from "node:assert/strict";
import { test } from "node:test";
import {
  enabledResearchTools,
  normalizeResearchLinks,
  RESEARCH_TOOLS,
  researchToolUrl,
} from "./research-links.ts";
import { withUtm } from "./outbound.ts";

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

test("the default-on set is pinned", () => {
  // Guards against a default silently flipping when a tool is added or edited.
  assert.deepEqual(
    RESEARCH_TOOLS.filter((t) => t.defaultEnabled).map((t) => t.id),
    ["atom", "namebio", "instantdomainsearch", "dotdb", "wipo", "trademarkia"],
  );
});

test("the Notify.Domains tools take the full domain", () => {
  const byId = Object.fromEntries(RESEARCH_TOOLS.map((t) => [t.id, t]));
  const d = { registrableDomain: "example.com", label: "example" };
  assert.equal(
    researchToolUrl(byId["notifyblacklist"]!, d),
    "https://notify.domains/domain-blacklist-checker-tool/?d=example.com",
  );
  assert.equal(
    researchToolUrl(byId["notifyrenewal"]!, d),
    "https://notify.domains/domain-renewal-cost-checker-tool/?d=example.com",
  );
  // The sidebar tags every research link on render (extItem -> withUtm).
  assert.equal(
    withUtm(researchToolUrl(byId["notifyblacklist"]!, d)),
    "https://notify.domains/domain-blacklist-checker-tool/?d=example.com&utm_source=extenddomains.com",
  );
});

test("url scope picks the domain or the bare label", () => {
  const d = { registrableDomain: "quiet harbor.com", label: "quiet harbor" };
  const byId = Object.fromEntries(RESEARCH_TOOLS.map((t) => [t.id, t]));
  assert.equal(
    researchToolUrl(byId["ahrefs"]!, d),
    "https://ahrefs.com/backlink-checker/?input=quiet%20harbor.com&mode=subdomains",
  );
  assert.equal(researchToolUrl(byId["dotdb"]!, d), "https://dotdb.com/search?keyword=quiet%20harbor&position=any");
  assert.equal(
    researchToolUrl(byId["godaddy"]!, d),
    "https://godaddy.com/domain-value-appraisal/appraisal?domainToCheck=quiet%20harbor.com",
  );
  assert.equal(
    researchToolUrl(byId["instantdomainsearch"]!, d),
    "https://instantdomainsearch.com/?q=quiet%20harbor",
  );
});

test("tmview keeps its hash route intact", () => {
  const byId = Object.fromEntries(RESEARCH_TOOLS.map((t) => [t.id, t]));
  const url = researchToolUrl(byId["tmview"]!, { registrableDomain: "example.com", label: "example" });
  assert.equal(
    url,
    "https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=example",
  );
});
