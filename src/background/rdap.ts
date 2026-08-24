// RDAP orchestration: cached IANA bootstrap → direct registry query;
// rdap.org only as fallback for TLDs the bootstrap doesn't cover (it's rate
// limited to ~10 req/10 s, so it must never be the normal path). No host
// permissions involved: RFC 7480 requires RDAP servers to send CORS headers,
// which is the only workable model given registry servers are arbitrary
// hosts (verified live for IANA, rdap.org, and Verisign, 2026-07-23).

import browser from "webextension-polyfill";
import { NO_RDAP_TLDS } from "../lib/rdap-coverage-data";
import { queryRdapDomain, resolveBootstrapUrl, type RdapResult } from "../lib/rdap";
import { queuedFetch, singleFlight } from "./net";

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_KEY = "rdapBootstrap";
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredBootstrap {
  fetchedAt: number;
  data: unknown;
}

let noRdapSet: Set<string> | null = null;

async function getBootstrap(): Promise<unknown | null> {
  const stored = await browser.storage.local.get(BOOTSTRAP_KEY);
  const record = stored[BOOTSTRAP_KEY] as StoredBootstrap | undefined;
  if (record !== undefined && Date.now() - record.fetchedAt < BOOTSTRAP_TTL_MS) {
    return record.data;
  }
  try {
    const fresh = await singleFlight("rdap-bootstrap", async () => {
      const res = await queuedFetch(BOOTSTRAP_URL, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`bootstrap HTTP ${res.status}`);
      return (await res.json()) as unknown;
    });
    await browser.storage.local.set({
      [BOOTSTRAP_KEY]: { fetchedAt: Date.now(), data: fresh } satisfies StoredBootstrap,
    });
    return fresh;
  } catch (err) {
    console.warn("RDAP bootstrap refresh failed:", err);
    return record?.data ?? null; // stale beats nothing
  }
}

export async function lookupRdap(registrableDomain: string, tld: string): Promise<RdapResult> {
  const bootstrap = await getBootstrap();
  const base = bootstrap !== null ? resolveBootstrapUrl(bootstrap, tld) : null;
  if (base !== null) {
    return queryRdapDomain(queuedFetch, base, registrableDomain);
  }
  noRdapSet ??= new Set(NO_RDAP_TLDS);
  if (noRdapSet.has(tld.toLowerCase())) {
    return { kind: "no-rdap" };
  }
  return queryRdapDomain(queuedFetch, "https://rdap.org", registrableDomain);
}
