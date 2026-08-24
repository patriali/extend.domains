// RDAP client pieces, pure and fetch-injected: bootstrap resolution
// (RFC 9224), domain queries, and response parsing. Orchestration (bootstrap
// caching, fallback policy) lives in src/background/rdap.ts.
//
// Registrant contacts are redacted post-GDPR — deliberately not extracted.

import type { FetchLike } from "./doh.ts";

export interface RdapRegistration {
  handle?: string;
  /** ISO dates, as sent by the registry. */
  created?: string;
  expires?: string;
  changed?: string;
  registrar?: { name?: string; ianaId?: string };
  /** EPP-style camelCase status codes (RFC 8056 mapping). */
  statuses: string[];
  nameservers: string[];
  /** secureDNS.delegationSigned; null when the registry doesn't say. */
  dnssec: boolean | null;
}

export type RdapResult =
  | { kind: "registered"; data: RdapRegistration }
  /** Authoritative 404. */
  | { kind: "unregistered" }
  /** This TLD has no RDAP service anywhere. */
  | { kind: "no-rdap" }
  /** Server error, timeout, malformed response — NOT "available". */
  | { kind: "unknown" };

const QUERY_TIMEOUT_MS = 8000;

/** TLD → base URL from a parsed IANA bootstrap file (dns.json). Prefers
 * https entries; a TLD with only http servers resolves to null. */
export function resolveBootstrapUrl(bootstrap: unknown, tld: string): string | null {
  const services = (bootstrap as { services?: unknown }).services;
  if (!Array.isArray(services)) return null;
  const want = tld.toLowerCase();
  for (const service of services) {
    if (!Array.isArray(service) || service.length < 2) continue;
    const [tlds, urls] = service as [unknown, unknown];
    if (!Array.isArray(tlds) || !Array.isArray(urls)) continue;
    if (!tlds.some((t) => typeof t === "string" && t.toLowerCase() === want)) continue;
    const https = urls.find((u) => typeof u === "string" && u.startsWith("https://"));
    return typeof https === "string" ? https : null;
  }
  return null;
}

export async function queryRdapDomain(
  fetchFn: FetchLike,
  baseUrl: string,
  domain: string,
): Promise<RdapResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}/domain/${domain}`;
  let res: Response;
  try {
    res = await fetchFn(url, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });
  } catch {
    return { kind: "unknown" };
  }
  if (res.status === 404) return { kind: "unregistered" };
  if (!res.ok) return { kind: "unknown" };
  try {
    return { kind: "registered", data: parseRdapDomain(await res.json()) };
  } catch {
    return { kind: "unknown" };
  }
}

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, Array<[string, unknown, string, unknown]>];
  publicIds?: Array<{ type?: string; identifier?: string }>;
}

export function parseRdapDomain(json: unknown): RdapRegistration {
  const j = json as {
    handle?: string;
    events?: RdapEvent[];
    status?: string[];
    entities?: RdapEntity[];
    nameservers?: Array<{ ldhName?: string }>;
    secureDNS?: { delegationSigned?: boolean };
  };

  const eventDate = (action: string): string | undefined =>
    j.events?.find((e) => e.eventAction === action)?.eventDate;

  const registrarEntity = j.entities?.find((e) => e.roles?.includes("registrar"));
  let registrar: RdapRegistration["registrar"];
  if (registrarEntity !== undefined) {
    const fn = registrarEntity.vcardArray?.[1]?.find((entry) => entry[0] === "fn")?.[3];
    const ianaId = registrarEntity.publicIds?.find(
      (p) => p.type === "IANA Registrar ID",
    )?.identifier;
    registrar = {
      ...(typeof fn === "string" ? { name: fn } : {}),
      ...(typeof ianaId === "string" ? { ianaId } : {}),
    };
  }

  return {
    ...(typeof j.handle === "string" ? { handle: j.handle } : {}),
    ...(defined("created", eventDate("registration"))),
    ...(defined("expires", eventDate("expiration"))),
    ...(defined("changed", eventDate("last changed"))),
    ...(registrar !== undefined ? { registrar } : {}),
    statuses: (j.status ?? []).map(toEppStatus),
    nameservers: (j.nameservers ?? [])
      .map((ns) => ns.ldhName?.toLowerCase())
      .filter((ns): ns is string => typeof ns === "string" && ns !== ""),
    dnssec: typeof j.secureDNS?.delegationSigned === "boolean" ? j.secureDNS.delegationSigned : null,
  };
}

/** RFC 8056: RDAP "client transfer prohibited" ↔ EPP clientTransferProhibited. */
export function toEppStatus(rdapStatus: string): string {
  return rdapStatus
    .trim()
    .split(/\s+/)
    .map((word, i) => (i === 0 ? word : word[0]?.toUpperCase() + word.slice(1)))
    .join("");
}

function defined(key: string, value: string | undefined): Record<string, string> {
  return value !== undefined ? { [key]: value } : {};
}
