import assert from "node:assert/strict";
import { test } from "node:test";
import type { FetchLike } from "./doh.ts";
import { fetchWaybackFirst, waybackLink } from "./wayback.ts";

/** Routes by host: availability (archive.org) and CDX (web.archive.org). */
function mockFetch(handlers: {
  availability?: unknown | number;
  cdx?: unknown | number;
}): FetchLike {
  return (url) => {
    const host = new URL(url).host;
    const spec = host === "archive.org" ? handlers.availability : handlers.cdx;
    if (spec === undefined) return Promise.reject(new Error("unrouted"));
    if (typeof spec === "number") return Promise.resolve(new Response("", { status: spec }));
    return Promise.resolve(Response.json(spec));
  };
}

const AVAIL_HIT = {
  archived_snapshots: {
    closest: {
      status: "200",
      available: true,
      url: "http://web.archive.org/web/20050428014715/http://www.youtube.com:80/",
      timestamp: "20050428014715",
    },
  },
};

test("availability API is the primary path", async () => {
  const r = await fetchWaybackFirst(mockFetch({ availability: AVAIL_HIT }), "youtube.com");
  assert.deepEqual(r.first, {
    ts: "20050428014715",
    date: "2005-04-28",
    original: "http://www.youtube.com:80/",
  });
  assert.equal(
    waybackLink(r.first!.ts, r.first!.original),
    "https://web.archive.org/web/20050428014715/http://www.youtube.com:80/",
  );
});

test("empty availability snapshot set means never archived", async () => {
  const r = await fetchWaybackFirst(
    mockFetch({ availability: { archived_snapshots: {} } }),
    "x.com",
  );
  assert.equal(r.first, null);
});

test("falls back to CDX when availability fails", async () => {
  const r = await fetchWaybackFirst(
    mockFetch({
      availability: 503,
      cdx: [
        ["timestamp", "original"],
        ["20020120142510", "http://example.com:80/"],
      ],
    }),
    "example.com",
  );
  assert.equal(r.first?.date, "2002-01-20");
});

test("CDX empty result means never archived", async () => {
  const r = await fetchWaybackFirst(
    mockFetch({ availability: 503, cdx: [["timestamp", "original"]] }),
    "x.com",
  );
  assert.equal(r.first, null);
});

test("throws when both paths fail", async () => {
  await assert.rejects(() => fetchWaybackFirst(mockFetch({ availability: 503, cdx: 503 }), "x.com"));
  await assert.rejects(() =>
    fetchWaybackFirst(mockFetch({ availability: { nope: 1 }, cdx: { nope: 1 } }), "x.com"),
  );
  await assert.rejects(() =>
    fetchWaybackFirst(mockFetch({ availability: 503, cdx: [["h"], ["not-a-ts"]] }), "x.com"),
  );
});
