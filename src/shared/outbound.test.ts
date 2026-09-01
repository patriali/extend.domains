import assert from "node:assert/strict";
import { test } from "node:test";
import { withUtm } from "./outbound.ts";

test("adds the param to a URL with no query", () => {
  assert.equal(withUtm("https://namebio.com/quietharbor.com"), "https://namebio.com/quietharbor.com?utm_source=extenddomains.com");
});

test("joins onto an existing query", () => {
  assert.equal(
    withUtm("https://instantdomainsearch.com/?q=quietharbor"),
    "https://instantdomainsearch.com/?q=quietharbor&utm_source=extenddomains.com",
  );
});

test("tags the real query, not the hash route", () => {
  assert.equal(
    withUtm("https://www.tmdn.org/tmview/#/tmview/results?criteria=C&basicSearch=quietharbor"),
    "https://www.tmdn.org/tmview/?utm_source=extenddomains.com#/tmview/results?criteria=C&basicSearch=quietharbor",
  );
});

test("a plain fragment stays last", () => {
  assert.equal(withUtm("https://example.com/a?b=1#frag"), "https://example.com/a?b=1&utm_source=extenddomains.com#frag");
});
