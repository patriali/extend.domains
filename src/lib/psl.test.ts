import assert from "node:assert/strict";
import { test } from "node:test";
import { splitDomain } from "./psl.ts";

test("plain .com", () => {
  assert.deepEqual(splitDomain("example.com"), {
    publicSuffix: "com",
    registrableDomain: "example.com",
    label: "example",
    subdomains: "",
  });
});

test("multi-label suffix .co.uk", () => {
  assert.deepEqual(splitDomain("quietharbor.co.uk"), {
    publicSuffix: "co.uk",
    registrableDomain: "quietharbor.co.uk",
    label: "quietharbor",
    subdomains: "",
  });
});

test("subdomains split off the registrable domain", () => {
  assert.deepEqual(splitDomain("a.b.example.co.uk"), {
    publicSuffix: "co.uk",
    registrableDomain: "example.co.uk",
    label: "example",
    subdomains: "a.b",
  });
});

test("bare public suffix is not a domain", () => {
  assert.equal(splitDomain("co.uk"), null);
  assert.equal(splitDomain("com"), null);
});

test("unknown TLD is rejected, not guessed", () => {
  assert.equal(splitDomain("example.notarealtld"), null);
});

test("wildcard rule *.ck makes bar.ck a suffix", () => {
  assert.equal(splitDomain("bar.ck"), null);
  assert.deepEqual(splitDomain("foo.bar.ck"), {
    publicSuffix: "bar.ck",
    registrableDomain: "foo.bar.ck",
    label: "foo",
    subdomains: "",
  });
});

test("exception rule !www.ck is registrable", () => {
  assert.deepEqual(splitDomain("www.ck"), {
    publicSuffix: "ck",
    registrableDomain: "www.ck",
    label: "www",
    subdomains: "",
  });
});

test("punycode ccTLD (.рф as xn--p1ai)", () => {
  const split = splitDomain("example.xn--p1ai");
  assert.equal(split?.publicSuffix, "xn--p1ai");
  assert.equal(split?.registrableDomain, "example.xn--p1ai");
});

test("malformed labels are rejected", () => {
  assert.equal(splitDomain("-bad.com"), null);
  assert.equal(splitDomain("bad-.com"), null);
  assert.equal(splitDomain("UPPER.com"), null); // caller must lowercase
  assert.equal(splitDomain(`${"a".repeat(64)}.com`), null);
});
