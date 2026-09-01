import assert from "node:assert/strict";
import { test } from "node:test";
import { buyNowUrl, marketplaceFromNs, normalizeBuyNow } from "./marketplace.ts";

test("recognises Atom's nameservers", () => {
  assert.equal(marketplaceFromNs(["ns1.atom.com", "ns2.atom.com"]), "atom");
});

test("normalises case and the root-zone trailing dot", () => {
  assert.equal(marketplaceFromNs(["NS1.ATOM.COM."]), "atom");
});

test("ignores unrelated nameservers, including lookalike suffixes", () => {
  assert.equal(marketplaceFromNs(["ns-166.awsdns-20.com", "frank.ns.cloudflare.com"]), null);
  assert.equal(marketplaceFromNs([]), null);
  // Spaceship's own delegation is not a listing signal — see marketplace.ts.
  assert.equal(marketplaceFromNs(["launch1.spaceship.net"]), null);
  // Suffix match is anchored: these merely end with the brand, they aren't it.
  assert.equal(marketplaceFromNs(["ns1.notatom.com"]), null);
  assert.equal(marketplaceFromNs(["ns1.atom.com.evil.example"]), null);
});

test("builds the checkout URL from the full registrable domain", () => {
  assert.equal(buyNowUrl("atom", "mess.ai"), "https://www.atom.com/name/mess.ai/rm/YwFgYcLYnG");
});

test("the button setting defaults to on", () => {
  assert.equal(normalizeBuyNow(undefined), true);
  assert.equal(normalizeBuyNow(null), true);
  assert.equal(normalizeBuyNow("nope"), true); // garbage in the store
  assert.equal(normalizeBuyNow(true), true);
  assert.equal(normalizeBuyNow(false), false); // only an explicit false turns it off
});
