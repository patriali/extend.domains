import assert from "node:assert/strict";
import { test } from "node:test";
import { brandCasingForLabel, buildMetadata, parseHead } from "./metadata.ts";

const HTML = `<!doctype html>
<html><head>
  <TITLE> Quiet Harbor &mdash; boats &amp; berths </TITLE>
  <meta name="description" content="A harbor, but quiet.">
  <meta property="og:title" content='Quiet Harbor'>
  <meta property="og:description" content="Berths &#8212; from &#x24;5">
  <meta property="og:image" content="/img/cover.jpg">
  <meta name="theme-color" content=#224466>
</head><body>
  <meta property="og:image" content="https://evil.example/body-injected.jpg">
</body></html>`;

test("parses the head, ignores the body", () => {
  const h = parseHead(HTML);
  assert.equal(h.title, "Quiet Harbor"); // og:title wins over <title>
  assert.equal(h.description, "Berths — from $5"); // og wins, entities decoded
  assert.equal(h.ogImage, "/img/cover.jpg"); // body-injected og:image ignored
  assert.equal(h.themeColor, "#224466"); // unquoted attribute
});

test("falls back to <title> and meta description", () => {
  const h = parseHead(`<head><title>Plain &quot;Title&quot;</title>
    <meta name="description" content="plain desc"></head>`);
  assert.equal(h.title, 'Plain "Title"');
  assert.equal(h.description, "plain desc");
});

test("no </head> — parses whatever arrived (Range-truncated response)", () => {
  const h = parseHead(`<head><title>Cut off</title><meta name="descr`);
  assert.equal(h.title, "Cut off");
});

test("empty page yields empty metadata", () => {
  assert.deepEqual(parseHead("<html><body>nope</body></html>"), {});
});

test("buildMetadata resolves og:image and detects cross-domain redirects", () => {
  const m = buildMetadata(HTML, "https://www.quietharbor.com/", "quietharbor.com");
  assert.equal(m.ogImage, "https://www.quietharbor.com/img/cover.jpg");
  assert.equal(m.crossDomain, false); // www subdomain is the same registrable domain

  const redirected = buildMetadata(HTML, "https://parked.example-broker.com/lander", "quietharbor.com");
  assert.equal(redirected.crossDomain, true);
});

test("rejects non-http og:image schemes", () => {
  const m = buildMetadata(
    `<head><meta property="og:image" content="javascript:alert(1)"></head>`,
    "https://a.com/",
    "a.com",
  );
  assert.equal(m.ogImage, undefined);
});

test("brandCasingForLabel extracts camelCase from the site title", () => {
  assert.equal(
    brandCasingForLabel("SilkCloak.com — Premium Domain For Sale", "silkcloak"),
    "SilkCloak",
  );
  assert.equal(brandCasingForLabel("DomainLanders | buy & sell", "domainlanders"), "DomainLanders");
  // No camelCase, or no match → null (nothing to gain).
  assert.equal(brandCasingForLabel("Silkcloak - home", "silkcloak"), null);
  assert.equal(brandCasingForLabel("Some Other Brand", "silkcloak"), null);
});

test("first meta occurrence wins (header spoof resistance)", () => {
  const h = parseHead(`<head>
    <meta property="og:title" content="real">
    <meta property="og:title" content="second">
  </head>`);
  assert.equal(h.title, "real");
});
