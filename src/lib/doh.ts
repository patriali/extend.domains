// DNS-over-HTTPS client: Cloudflare primary, Google fallback, JSON wire
// format. Pure module — the fetch implementation is injected so the
// background can pass its rate-limited queuedFetch and tests can pass mocks.

import { detectParking, type ParkingMatch } from "./parking.ts";

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

export interface DnsSummary {
  /** "nxdomain" when the NS query says the name does not exist. */
  status: "ok" | "nxdomain";
  a: string[];
  ns: string[];
  /** MX exchange hosts (priority stripped; RFC 7505 null MX excluded). */
  mx: string[];
  txt: string[];
  signals: {
    /** NS present → registered and delegated. */
    delegated: boolean;
    /** NS matches a known parking/broker provider. */
    parked: ParkingMatch | null;
    /** MX present → someone receives email on it. */
    hasEmail: boolean;
    hasSpf: boolean;
    hasDmarc: boolean;
  };
}

interface DohAnswer {
  name: string;
  type: number;
  data: string;
}

interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

type QueryType = "A" | "NS" | "MX" | "TXT";
const TYPE_NUM: Record<QueryType, number> = { A: 1, NS: 2, MX: 15, TXT: 16 };

interface Provider {
  url: (name: string, type: QueryType) => string;
  headers: Record<string, string>;
}

const PROVIDERS: Provider[] = [
  {
    url: (name, type) =>
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    headers: { Accept: "application/dns-json" },
  },
  {
    url: (name, type) => `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
    headers: {},
  },
];

const QUERY_TIMEOUT_MS = 4000;

/** One query, tried against each provider in order. NOERROR/NXDOMAIN are
 * answers; anything else (SERVFAIL, HTTP errors, timeouts) moves on. */
export async function dohQuery(
  fetchFn: FetchLike,
  name: string,
  type: QueryType,
): Promise<DohResponse> {
  let lastError: unknown;
  for (const p of PROVIDERS) {
    try {
      const res = await fetchFn(p.url(name, type), {
        headers: p.headers,
        signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
      });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as DohResponse;
      if (typeof body.Status !== "number") {
        lastError = new Error("malformed DoH response");
        continue;
      }
      if (body.Status === 0 || body.Status === 3) return body;
      lastError = new Error(`DNS rcode ${body.Status}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("DoH query failed");
}

export async function fetchDnsSummary(fetchFn: FetchLike, domain: string): Promise<DnsSummary> {
  const settled = await Promise.allSettled([
    dohQuery(fetchFn, domain, "NS"),
    dohQuery(fetchFn, domain, "A"),
    dohQuery(fetchFn, domain, "MX"),
    dohQuery(fetchFn, domain, "TXT"),
    dohQuery(fetchFn, `_dmarc.${domain}`, "TXT"),
  ]);
  const [nsQ, aQ, mxQ, txtQ, dmarcQ] = settled.map((s) =>
    s.status === "fulfilled" ? s.value : null,
  );

  // NS is the load-bearing query; the others degrade to "empty" individually.
  if (nsQ === null || nsQ === undefined) {
    throw new Error("NS query failed on all providers");
  }

  const records = (q: DohResponse | null | undefined, type: QueryType): string[] =>
    (q?.Answer ?? []).filter((ans) => ans.type === TYPE_NUM[type]).map((ans) => ans.data);

  const ns = records(nsQ, "NS").map(stripDot);
  const a = records(aQ, "A");
  const mx = records(mxQ, "MX")
    .map((d) => stripDot(d.trim().split(/\s+/).pop() ?? ""))
    .filter((host) => host !== ""); // drops RFC 7505 null MX ("0 .")
  const txt = records(txtQ, "TXT").map(unquoteTxt);
  const dmarcTxt = records(dmarcQ, "TXT").map(unquoteTxt);

  return {
    status: nsQ.Status === 3 ? "nxdomain" : "ok",
    a,
    ns,
    mx,
    txt,
    signals: {
      delegated: ns.length > 0,
      parked: detectParking(ns),
      hasEmail: mx.length > 0,
      hasSpf: txt.some((t) => /^v=spf1\b/i.test(t)),
      hasDmarc: dmarcTxt.some((t) => /^v=dmarc1\b/i.test(t)),
    },
  };
}

function stripDot(host: string): string {
  return host.replace(/\.$/, "");
}

/** TXT data arrives quoted and possibly chunked: `"part1" "part2"`. */
function unquoteTxt(data: string): string {
  return data.replace(/^"|"$/g, "").replace(/"\s+"/g, "");
}
