import assert from "node:assert/strict";
import { test } from "node:test";
import { dohQuery, fetchDnsSummary, type FetchLike } from "./doh.ts";
import { detectParking } from "./parking.ts";

/** Routes keyed by "name:TYPE"; unrouted queries answer NOERROR-empty. */
function mockFetch(routes: Record<string, unknown>): FetchLike {
  return (url) => {
    const u = new URL(url);
    const key = `${u.searchParams.get("name")}:${u.searchParams.get("type")}`;
    const body = routes[key] ?? { Status: 0 };
    return Promise.resolve(Response.json(body));
  };
}

const nsAnswer = (hosts: string[]) => ({
  Status: 0,
  Answer: hosts.map((h) => ({ name: "x.com.", type: 2, data: `${h}.` })),
});

test("parking detection matches known providers, by whom", () => {
  assert.equal(detectParking(["ns1.sedoparking.com."])?.provider, "Sedo");
  assert.equal(detectParking(["NS3.AFTERNIC.COM"])?.provider, "Afternic");
  assert.equal(detectParking(["ns1.parkingcrew.net."])?.provider, "ParkingCrew");
  assert.equal(detectParking(["ns1.atom.com."])?.provider, "Atom.com");
  assert.equal(detectParking(["ns-1.awsdns-01.org."]), null);
  // no substring false positives on lookalike registered domains
  assert.equal(detectParking(["ns1.notsedo.com."]), null);
});

test("summary derives signals: operated domain", async () => {
  const summary = await fetchDnsSummary(
    mockFetch({
      "example.com:NS": nsAnswer(["a.iana-servers.net", "b.iana-servers.net"]),
      "example.com:A": { Status: 0, Answer: [{ name: "example.com.", type: 1, data: "93.184.215.14" }] },
      "example.com:MX": { Status: 0, Answer: [{ name: "example.com.", type: 15, data: "10 mail.example.com." }] },
      "example.com:TXT": { Status: 0, Answer: [{ name: "example.com.", type: 16, data: '"v=spf1 -all"' }] },
      "_dmarc.example.com:TXT": { Status: 0, Answer: [{ name: "_dmarc.example.com.", type: 16, data: '"v=DMARC1; p=reject"' }] },
    }),
    "example.com",
  );
  assert.equal(summary.status, "ok");
  assert.deepEqual(summary.mx, ["mail.example.com"]);
  assert.equal(summary.signals.delegated, true);
  assert.equal(summary.signals.parked, null);
  assert.equal(summary.signals.hasEmail, true);
  assert.equal(summary.signals.hasSpf, true);
  assert.equal(summary.signals.hasDmarc, true);
});

test("summary flags parked domain and absent email", async () => {
  const summary = await fetchDnsSummary(
    mockFetch({ "parked.com:NS": nsAnswer(["ns1.bodis.com", "ns2.bodis.com"]) }),
    "parked.com",
  );
  assert.equal(summary.signals.parked?.provider, "Bodis");
  assert.equal(summary.signals.hasEmail, false);
  assert.equal(summary.signals.hasSpf, false);
});

test("RFC 7505 null MX means no email", async () => {
  const summary = await fetchDnsSummary(
    mockFetch({
      "nomail.com:NS": nsAnswer(["ns1.example.net"]),
      "nomail.com:MX": { Status: 0, Answer: [{ name: "nomail.com.", type: 15, data: "0 ." }] },
    }),
    "nomail.com",
  );
  assert.deepEqual(summary.mx, []);
  assert.equal(summary.signals.hasEmail, false);
});

test("NXDOMAIN propagates", async () => {
  const summary = await fetchDnsSummary(mockFetch({ "gone.com:NS": { Status: 3 } }), "gone.com");
  assert.equal(summary.status, "nxdomain");
  assert.equal(summary.signals.delegated, false);
});

test("falls back to the second provider", async () => {
  let googleHit = false;
  const fetchFn: FetchLike = (url) => {
    const u = new URL(url);
    if (u.host === "cloudflare-dns.com") return Promise.resolve(new Response("", { status: 500 }));
    googleHit = true;
    return Promise.resolve(Response.json({ Status: 0 }));
  };
  const res = await dohQuery(fetchFn, "example.com", "NS");
  assert.equal(res.Status, 0);
  assert.equal(googleHit, true);
});

test("throws when the NS query fails everywhere", async () => {
  const fetchFn: FetchLike = () => Promise.resolve(new Response("", { status: 500 }));
  await assert.rejects(() => fetchDnsSummary(fetchFn, "example.com"));
});
