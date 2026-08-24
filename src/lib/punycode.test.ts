import assert from "node:assert/strict";
import { test } from "node:test";
import { decodePunycodeLabel, toUnicodeHost } from "./punycode.ts";

// Round-trip through WHATWG URL (which encodes) proves decoding is correct
// without trusting hand-remembered vectors.
function roundtrips(asciiLabel: string): void {
  const decoded = decodePunycodeLabel(asciiLabel);
  assert.ok(decoded !== null, `failed to decode ${asciiLabel}`);
  const reEncoded = new URL(`http://${decoded}.com`).hostname;
  assert.equal(reEncoded, `${asciiLabel}.com`);
}

test("known labels decode and round-trip", () => {
  assert.equal(decodePunycodeLabel("xn--mnchen-3ya"), "münchen");
  assert.equal(decodePunycodeLabel("xn--bcher-kva"), "bücher");
  assert.equal(decodePunycodeLabel("xn--p1ai"), "рф");
  for (const label of ["xn--mnchen-3ya", "xn--bcher-kva", "xn--p1ai", "xn--80asehdb"]) {
    roundtrips(label);
  }
});

test("non-punycode labels pass through", () => {
  assert.equal(decodePunycodeLabel("example"), "example");
});

test("garbage after xn-- returns null", () => {
  assert.equal(decodePunycodeLabel("xn--!!!"), null);
});

test("toUnicodeHost decodes per label with fallback", () => {
  assert.equal(toUnicodeHost("xn--mnchen-3ya.de"), "münchen.de");
  assert.equal(toUnicodeHost("www.example.com"), "www.example.com");
});
