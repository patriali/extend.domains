import assert from "node:assert/strict";
import { test } from "node:test";
import { findLastDomainInText, parseDomainCandidate } from "./domain.ts";

test("bare domain", () => {
  const d = parseDomainCandidate("quietharbor.com");
  assert.equal(d?.ascii, "quietharbor.com");
  assert.equal(d?.registrableDomain, "quietharbor.com");
  assert.equal(d?.isIdn, false);
});

test("URL-shaped selection yields its host", () => {
  const d = parseDomainCandidate("  https://QuietHarbor.com/path?q=1 ");
  assert.equal(d?.ascii, "quietharbor.com");
});

test("host with port and trailing dot", () => {
  assert.equal(parseDomainCandidate("example.com:8080")?.ascii, "example.com");
  assert.equal(parseDomainCandidate("example.com.")?.ascii, "example.com");
});

test("IDN is punycoded, display keeps unicode", () => {
  const d = parseDomainCandidate("münchen.de");
  assert.equal(d?.ascii, "xn--mnchen-3ya.de");
  assert.equal(d?.display, "münchen.de");
  assert.equal(d?.isIdn, true);
});

test("selecting the punycode form still gets a unicode display", () => {
  const d = parseDomainCandidate("xn--mnchen-3ya.de");
  assert.equal(d?.ascii, "xn--mnchen-3ya.de");
  assert.equal(d?.display, "münchen.de");
});

test("wrapping punctuation is stripped", () => {
  assert.equal(parseDomainCandidate("“example.co.uk”.")?.ascii, "example.co.uk");
});

test("rejects non-domains", () => {
  assert.equal(parseDomainCandidate(""), null);
  assert.equal(parseDomainCandidate("hello world"), null);
  assert.equal(parseDomainCandidate("192.168.1.1"), null);
  assert.equal(parseDomainCandidate("[::1]"), null);
  assert.equal(parseDomainCandidate("co.uk"), null);
  assert.equal(parseDomainCandidate("readme.txt"), null);
  assert.equal(parseDomainCandidate("localhost"), null);
});

test("preserves the label's original casing for camelCase splitting", () => {
  assert.equal(parseDomainCandidate("SilkCloak.com")?.caseLabel, "SilkCloak");
  assert.equal(parseDomainCandidate("https://NuVenture.com/x")?.caseLabel, "NuVenture");
  assert.equal(parseDomainCandidate("example.com")?.caseLabel, "example");
  assert.equal(findLastDomainInText("go to NuVenture.com now")?.caseLabel, "NuVenture");
});

test("finds a domain highlighted mid-sentence", () => {
  const d = findLastDomainInText("st signed up on DomainLanders.com thank y");
  assert.equal(d?.ascii, "domainlanders.com");
  assert.equal(d?.registrableDomain, "domainlanders.com");
});

test("returns the LAST valid domain in the selection", () => {
  assert.equal(
    findLastDomainInText("compare foo.com and bar.net today")?.ascii,
    "bar.net",
  );
  // trailing domain wins even with a valid one earlier
  assert.equal(
    findLastDomainInText("from a.com via b.org to quietharbor.co.uk")?.registrableDomain,
    "quietharbor.co.uk",
  );
});

test("skips shaped-but-invalid tokens (bad TLD, bare suffix)", () => {
  // readme.txt (not a TLD) and co.uk (bare public suffix) are skipped.
  assert.equal(
    findLastDomainInText("open readme.txt, hosted on co.uk, see quietharbor.co.uk now")
      ?.registrableDomain,
    "quietharbor.co.uk",
  );
});

test("finds a domain wrapped in punctuation or a URL", () => {
  assert.equal(findLastDomainInText("(via https://example.co.uk/path).")?.registrableDomain, "example.co.uk");
  assert.equal(findLastDomainInText("email me at bob@example.com please")?.ascii, "example.com");
});

test("prose with no domain returns null", () => {
  assert.equal(findLastDomainInText("just some words, e.g. nothing here"), null);
  assert.equal(findLastDomainInText(""), null);
});

test("bare-domain selection still resolves exactly", () => {
  assert.equal(findLastDomainInText("münchen.de")?.ascii, "xn--mnchen-3ya.de");
});
