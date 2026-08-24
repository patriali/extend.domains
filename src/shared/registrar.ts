// Registrar preference: which registrar the sidebar's "Register" button links
// to, persisted in storage.local. Each registrar carries a domain-search URL
// template with a `{q}` placeholder that is replaced by the ASCII domain
// (URL-encoded). Mirrors shared/theme.ts.

import browser from "webextension-polyfill";

export interface Registrar {
  id: string;
  name: string;
  /** Domain-search URL; `{q}` is replaced by the URL-encoded ASCII domain. */
  template: string;
}

// Major registrars, ordered roughly by popularity. Each URL prefills the given
// name in that registrar's domain search.
export const REGISTRARS: readonly Registrar[] = [
  { id: "spaceship", name: "Spaceship", template: "https://www.spaceship.com/domain-search/?query={q}&tab=domains" },
  { id: "namecheap", name: "Namecheap", template: "https://www.namecheap.com/domains/registration/results/?domain={q}" },
  { id: "godaddy", name: "GoDaddy", template: "https://www.godaddy.com/domainsearch/find?domainToCheck={q}" },
  { id: "cloudflare", name: "Cloudflare", template: "https://domains.cloudflare.com/?domain={q}" },
  { id: "porkbun", name: "Porkbun", template: "https://porkbun.com/checkout/search?q={q}" },
  { id: "name", name: "Name.com", template: "https://www.name.com/domain/search/{q}" },
  { id: "dynadot", name: "Dynadot", template: "https://www.dynadot.com/domain/search.html?domain={q}" },
  { id: "hover", name: "Hover", template: "https://www.hover.com/domains/results?q={q}" },
  { id: "gandi", name: "Gandi", template: "https://shop.gandi.net/en/domain/suggest?search={q}" },
  { id: "squarespace", name: "Squarespace", template: "https://domains.squarespace.com/domain-search?query={q}" },
  { id: "ionos", name: "IONOS", template: "https://www.ionos.com/domains/domain-names?keyword={q}" },
  { id: "networksolutions", name: "Network Solutions", template: "https://www.networksolutions.com/domains/results?domainName={q}" },
  { id: "gname", name: "Gname", template: "https://www.gname.com/search?ym={q}" },
];

export const REGISTRAR_KEY = "registrar";

const DEFAULT_REGISTRAR_ID = "spaceship";

export function isRegistrarId(v: unknown): v is string {
  return typeof v === "string" && REGISTRARS.some((r) => r.id === v);
}

export function registrarById(id: string): Registrar {
  return REGISTRARS.find((r) => r.id === id) ?? REGISTRARS[0]!;
}

/** Builds the domain-search URL for a registrar and an ASCII domain. */
export function registrarSearchUrl(reg: Registrar, ascii: string): string {
  return reg.template.replace("{q}", encodeURIComponent(ascii));
}

export async function loadRegistrar(): Promise<Registrar> {
  const stored = await browser.storage.local.get(REGISTRAR_KEY);
  const id = stored[REGISTRAR_KEY];
  return registrarById(isRegistrarId(id) ? id : DEFAULT_REGISTRAR_ID);
}

export async function saveRegistrar(id: string): Promise<void> {
  await browser.storage.local.set({ [REGISTRAR_KEY]: id });
}
