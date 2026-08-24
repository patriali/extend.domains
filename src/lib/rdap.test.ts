import assert from "node:assert/strict";
import { test } from "node:test";
import type { FetchLike } from "./doh.ts";
import { parseRdapDomain, queryRdapDomain, resolveBootstrapUrl, toEppStatus } from "./rdap.ts";

// Shaped like a real Verisign response (verified live 2026-07-23).
const SAMPLE = {
  objectClassName: "domain",
  handle: "2336799_DOMAIN_COM-VRSN",
  ldhName: "EXAMPLE.COM",
  status: ["client delete prohibited", "client transfer prohibited"],
  events: [
    { eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" },
    { eventAction: "expiration", eventDate: "2026-08-13T04:00:00Z" },
    { eventAction: "last changed", eventDate: "2026-01-16T18:26:50Z" },
    { eventAction: "last update of RDAP database", eventDate: "2026-07-23T13:40:07Z" },
  ],
  entities: [
    {
      objectClassName: "entity",
      roles: ["registrar"],
      vcardArray: ["vcard", [["fn", {}, "text", "Example Registrar Inc."]]],
      publicIds: [{ type: "IANA Registrar ID", identifier: "376" }],
    },
  ],
  nameservers: [
    { objectClassName: "nameserver", ldhName: "ELLIOTT.NS.CLOUDFLARE.COM" },
    { objectClassName: "nameserver", ldhName: "HERA.NS.CLOUDFLARE.COM" },
  ],
  secureDNS: { delegationSigned: true },
};

test("parses a registry response", () => {
  const r = parseRdapDomain(SAMPLE);
  assert.equal(r.created, "1995-08-14T04:00:00Z");
  assert.equal(r.expires, "2026-08-13T04:00:00Z");
  assert.equal(r.changed, "2026-01-16T18:26:50Z");
  assert.equal(r.registrar?.name, "Example Registrar Inc.");
  assert.equal(r.registrar?.ianaId, "376");
  assert.deepEqual(r.statuses, ["clientDeleteProhibited", "clientTransferProhibited"]);
  assert.deepEqual(r.nameservers, ["elliott.ns.cloudflare.com", "hera.ns.cloudflare.com"]);
  assert.equal(r.dnssec, true);
});

test("parses a sparse response without blowing up", () => {
  const r = parseRdapDomain({ objectClassName: "domain" });
  assert.deepEqual(r.statuses, []);
  assert.deepEqual(r.nameservers, []);
  assert.equal(r.dnssec, null);
  assert.equal(r.created, undefined);
});

test("RFC 8056 status mapping", () => {
  assert.equal(toEppStatus("client transfer prohibited"), "clientTransferProhibited");
  assert.equal(toEppStatus("active"), "active");
});

test("bootstrap resolution prefers https and matches case-insensitively", () => {
  const bootstrap = {
    services: [
      [["com", "net"], ["https://rdap.verisign.com/com/v1/"]],
      [["kg"], ["http://rdap.cctld.kg/"]],
    ],
  };
  assert.equal(resolveBootstrapUrl(bootstrap, "COM"), "https://rdap.verisign.com/com/v1/");
  assert.equal(resolveBootstrapUrl(bootstrap, "kg"), null); // http-only → no direct query
  assert.equal(resolveBootstrapUrl(bootstrap, "de"), null);
  assert.equal(resolveBootstrapUrl({ nonsense: true }, "com"), null);
});

const respond = (status: number, body?: unknown): FetchLike => {
  return () =>
    Promise.resolve(
      body !== undefined ? Response.json(body, { status }) : new Response("", { status }),
    );
};

test("404 means unregistered; other errors mean unknown", async () => {
  assert.deepEqual(await queryRdapDomain(respond(404), "https://x", "a.com"), {
    kind: "unregistered",
  });
  assert.equal((await queryRdapDomain(respond(500), "https://x", "a.com")).kind, "unknown");
  assert.equal((await queryRdapDomain(respond(429), "https://x", "a.com")).kind, "unknown");
  const failing: FetchLike = () => Promise.reject(new Error("network down"));
  assert.equal((await queryRdapDomain(failing, "https://x", "a.com")).kind, "unknown");
});

test("200 parses into registered", async () => {
  const r = await queryRdapDomain(respond(200, SAMPLE), "https://x", "example.com");
  assert.equal(r.kind, "registered");
  assert.equal(r.kind === "registered" ? r.data.registrar?.ianaId : undefined, "376");
});
