// Per-domain result cache in storage.local (spec §7): keyed by registrable
// domain, 24h TTL on the whole record. Sources merge into one record as they
// arrive; the TTL clock starts at the record's first write, so a partial
// record doesn't live forever by being repeatedly topped up.

import browser from "webextension-polyfill";
import type { DnsSummary } from "../lib/doh";
import type { SiteMetadata } from "../lib/metadata";
import type { RdapResult } from "../lib/rdap";
import type { WaybackResult } from "../lib/wayback";

const TTL_MS = 24 * 60 * 60 * 1000;

export interface DomainCacheRecord {
  fetchedAt: number;
  dns?: DnsSummary;
  /** Only conclusive results ("registered"/"unregistered") are cached. */
  rdap?: RdapResult;
  meta?: SiteMetadata;
  /** Site was unreachable — cached so dead domains don't re-time-out for 24h. */
  metaUnreachable?: boolean;
  /** Cached for both found and never-archived. */
  wayback?: WaybackResult;
}

// Bump the version when a fetcher/parser change makes old records wrong —
// old-version keys are simply never read again and age out of storage.local.
const CACHE_VERSION = 2;

const key = (domain: string): string => `cache:v${CACHE_VERSION}:${domain}`;

export async function cacheGet(domain: string): Promise<DomainCacheRecord | null> {
  const stored = await browser.storage.local.get(key(domain));
  const record = stored[key(domain)] as DomainCacheRecord | undefined;
  if (record === undefined) return null;
  if (Date.now() - record.fetchedAt > TTL_MS) {
    void browser.storage.local.remove(key(domain));
    return null;
  }
  return record;
}

export async function cacheRemove(domain: string): Promise<void> {
  await browser.storage.local.remove(key(domain));
}

export async function cachePatch(
  domain: string,
  patch: Partial<Omit<DomainCacheRecord, "fetchedAt">>,
): Promise<void> {
  const existing = await cacheGet(domain);
  const record: DomainCacheRecord =
    existing !== null ? { ...existing, ...patch } : { fetchedAt: Date.now(), ...patch };
  await browser.storage.local.set({ [key(domain)]: record });
}
