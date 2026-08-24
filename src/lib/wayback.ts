// Wayback Machine client: first snapshot only, best-effort. Pure module.
//
// Primary: the availability API (archive.org/wayback/available) asked for the
// snapshot closest to 1990-01-01 — a date that predates every capture in the
// archive, so "closest" is provably the earliest snapshot. It answers in a
// few seconds and sends proper CORS headers. The CDX API (the canonical
// first-snapshot source) is the fallback only: measured behavior is 10–20 s
// responses, intermittent 503s, and no CORS headers (it relies on the
// <all_urls> host access instead). Nothing waits on this source either way.

import type { FetchLike } from "./doh.ts";

export interface WaybackResult {
  /** null = never archived. */
  first: {
    /** Raw Wayback timestamp, e.g. "20020120142510". */
    ts: string;
    /** "2002-01-20". */
    date: string;
    original: string;
  } | null;
}

const AVAILABILITY_TIMEOUT_MS = 8000;
const CDX_TIMEOUT_MS = 30000;
const TS_RE = /^\d{8,14}$/;

export async function fetchWaybackFirst(
  fetchFn: FetchLike,
  domain: string,
): Promise<WaybackResult> {
  try {
    return await fetchViaAvailability(fetchFn, domain);
  } catch {
    return fetchViaCdx(fetchFn, domain);
  }
}

async function fetchViaAvailability(fetchFn: FetchLike, domain: string): Promise<WaybackResult> {
  const url =
    "https://archive.org/wayback/available" +
    `?url=${encodeURIComponent(domain)}&timestamp=19900101`;
  const res = await fetchFn(url, { signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as {
    archived_snapshots?: { closest?: { timestamp?: string; url?: string; available?: boolean } };
  };
  if (body.archived_snapshots === undefined) throw new Error("malformed availability response");
  const closest = body.archived_snapshots.closest;
  if (closest === undefined) return { first: null }; // {} = never archived
  const ts = closest.timestamp;
  if (typeof ts !== "string" || !TS_RE.test(ts)) throw new Error("malformed snapshot");
  const original =
    typeof closest.url === "string"
      ? closest.url.replace(/^https?:\/\/web\.archive\.org\/web\/\d+(?:[a-z_]+)?\//, "")
      : `http://${domain}/`;
  return { first: snapshot(ts, original) };
}

async function fetchViaCdx(fetchFn: FetchLike, domain: string): Promise<WaybackResult> {
  const url =
    "https://web.archive.org/cdx/search/cdx" +
    `?url=${encodeURIComponent(domain)}&output=json&limit=1&fl=timestamp,original`;
  const res = await fetchFn(url, { signal: AbortSignal.timeout(CDX_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) throw new Error("malformed CDX response");
  if (rows.length < 2) return { first: null }; // header row only (or []) = never archived
  const row = rows[1] as unknown[];
  const ts = Array.isArray(row) ? row[0] : undefined;
  if (typeof ts !== "string" || !TS_RE.test(ts)) throw new Error("malformed CDX row");
  const original = typeof row[1] === "string" ? row[1] : `http://${domain}/`;
  return { first: snapshot(ts, original) };
}

function snapshot(ts: string, original: string): NonNullable<WaybackResult["first"]> {
  return { ts, date: `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`, original };
}

export function waybackLink(ts: string, original: string): string {
  return `https://web.archive.org/web/${ts}/${original}`;
}
