// Sidebar entry point. Renders progressively from messages sent by the
// background context; it never fetches anything itself.

import browser from "webextension-polyfill";
import type { DnsSummary } from "../lib/doh";
import type { SiteMetadata } from "../lib/metadata";
import type { RdapResult } from "../lib/rdap";
import type { ScoreResult } from "../lib/scorer";
import { waybackLink, type WaybackResult } from "../lib/wayback";
import { clearHistory, HISTORY_KEY, readHistory, type HistoryEntry } from "../shared/history";
import {
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
  type SectionConfig,
  type SectionId,
} from "../shared/layout";
import { loadLayout } from "../shared/layout-store";
import {
  enabledResearchTools,
  normalizeResearchLinks,
  RESEARCH_LINKS_KEY,
  type ResearchLinkSettings,
  researchToolUrl,
} from "../shared/research-links";
import { loadResearchLinks } from "../shared/research-links-store";
import {
  loadRegistrar,
  REGISTRAR_KEY,
  REGISTRARS,
  type Registrar,
  registrarSearchUrl,
} from "../shared/registrar";
import { initTheme } from "../shared/theme";
import { faviconUrl } from "./favicon";
import type {
  AnyMessage,
  DomainLookupState,
  GetStateMessage,
  LookupState,
  RefreshMessage,
  SelectionMessage,
  SourceState,
} from "../shared/messages";
import { DOH_ORIGINS } from "../shared/net-permissions";

const app = document.getElementById("app")!;

initTheme();

// Search bar (lives outside #app so it survives the replaceChildren on every
// render, and keeps focus/typed text while results stream in).
const searchForm = document.getElementById("searchbar") as HTMLFormElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;

// Bare labels typed here ("grok") resolve to the .com version; a domain with an
// explicit TLD ("grok.bot") is used as-is.
const DEFAULT_TLD = "com";

function runSearch(explicit: boolean): void {
  const text = searchInput.value.trim();
  if (text === "") return;
  const msg: SelectionMessage = {
    type: "selection",
    text,
    explicit,
    defaultTld: DEFAULT_TLD,
  };
  void browser.runtime.sendMessage(msg);
}

// Search as you type: debounce so we only fire once typing pauses, and keep
// these lookups non-explicit so a half-typed query doesn't flash a "not a
// domain" error — that feedback is reserved for pressing Enter.
let searchDebounce: number | undefined;
searchInput.addEventListener("input", () => {
  window.clearTimeout(searchDebounce);
  searchDebounce = window.setTimeout(() => runSearch(false), 250);
});

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  window.clearTimeout(searchDebounce);
  runSearch(true);
  searchInput.blur(); // let the current-domain reflection take over the field
});

// Look up the domain of the active tab. The active tab's URL is read from its
// content script (present via the <all_urls> match) so no `tabs` permission is
// needed; restricted pages with no content script fail gracefully.
const useCurrentTab = document.getElementById("use-current-tab") as HTMLButtonElement;
useCurrentTab.addEventListener("click", () => {
  void (async () => {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) throw new Error("no active tab");
      const url = await browser.tabs.sendMessage(tab.id, { type: "getPageUrl" });
      if (typeof url !== "string" || url === "") throw new Error("no url");
      const msg: SelectionMessage = { type: "selection", text: url, explicit: true };
      void browser.runtime.sendMessage(msg);
    } catch {
      useCurrentTab.classList.add("failed");
      window.setTimeout(() => useCurrentTab.classList.remove("failed"), 1000);
    }
  })();
});

let history: HistoryEntry[] = [];
let layout: SectionConfig[] = DEFAULT_LAYOUT;
let registrar: Registrar | null = null;
let researchLinks: ResearchLinkSettings = normalizeResearchLinks(undefined);
let lastState: LookupState = { kind: "idle" };

void readHistory().then((list) => {
  history = list;
  refreshHistorySection();
});
void loadLayout().then((list) => {
  layout = list;
  render(lastState);
});
void loadRegistrar().then((reg) => {
  registrar = reg;
  render(lastState);
});
void loadResearchLinks().then((links) => {
  researchLinks = links;
  render(lastState);
});
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (HISTORY_KEY in changes) {
    const next = changes[HISTORY_KEY]?.newValue;
    history = Array.isArray(next) ? (next as HistoryEntry[]) : [];
    refreshHistorySection();
  }
  if (LAYOUT_STORAGE_KEY in changes) {
    void loadLayout().then((list) => {
      layout = list;
      render(lastState);
    });
  }
  if (REGISTRAR_KEY in changes) {
    void loadRegistrar().then((reg) => {
      registrar = reg;
      render(lastState);
    });
  }
  if (RESEARCH_LINKS_KEY in changes) {
    void loadResearchLinks().then((links) => {
      researchLinks = links;
      render(lastState);
    });
  }
});

browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as AnyMessage;
  if (msg.type === "stateChanged") render(msg.state);
});

const getState: GetStateMessage = { type: "getState" };
void browser.runtime.sendMessage(getState).then((state) => {
  render((state as LookupState | undefined) ?? { kind: "idle" });
});

function sectionEnabled(id: SectionId): boolean {
  return layout.find((s) => s.id === id)?.enabled ?? true;
}

// Bottom bar, outside #app so it stays pinned while the results scroll.
const registerBar = document.getElementById("registerbar")!;

/** Shows the call to action only for a name RDAP reports as unregistered. */
function renderRegisterBar(state: LookupState): void {
  registerBar.replaceChildren();
  if (
    state.kind === "domain" &&
    state.rdap.status === "ok" &&
    state.rdap.data.kind === "unregistered"
  ) {
    registerBar.append(registerButton(state.domain.ascii));
    registerBar.hidden = false;
  } else {
    registerBar.hidden = true;
  }
}

function render(state: LookupState): void {
  lastState = state;
  renderRegisterBar(state);
  // Reflect the current domain in the search field as a breadcrumb — but never
  // clobber what the user is actively typing.
  if (state.kind === "domain" && document.activeElement !== searchInput) {
    searchInput.value = state.domain.display;
  }
  app.replaceChildren();
  switch (state.kind) {
    case "idle": {
      const idle: HTMLElement[] = [
        section("empty-state", [
          el("h1", {}, "Extend.Domains"),
          el(
            "p",
            {},
            "Highlight a domain name on any page, then open the lookup from the right-click menu or the toolbar button.",
          ),
        ]),
      ];
      if (sectionEnabled("recent")) idle.push(recentSection());
      app.append(...idle);
      return;
    }
    case "invalid":
      app.append(
        section("empty-state", [
          el("p", {}, `“${state.text}” doesn’t look like a registrable domain.`),
        ]),
      );
      return;
    case "domain": {
      const d = state.domain;
      const titleRow = el("div", { className: "title-row" });
      const nameEl = el("h1", {}, d.display);
      makeCopyable(nameEl, d.display);
      titleRow.append(nameEl);
      // Insert the favicon only once it actually loads, so a domain with no
      // favicon (or the loading gap) never reserves space and shifts the name.
      // On success it fades in before the name; on error it's never added.
      const icon = el("img", { className: "favicon" });
      icon.alt = "";
      icon.addEventListener("load", () => titleRow.insertBefore(icon, nameEl));
      icon.src = faviconUrl(d.registrableDomain);
      const copy = el("button", { className: "icon-btn" }, "⧉");
      copy.title = "Copy summary (Markdown)";
      copy.addEventListener("click", () => {
        void navigator.clipboard
          .writeText(buildSummary(state))
          .then(() => flashGlyph(copy, "✓"))
          .catch(() => flashGlyph(copy, "✕"));
      });
      titleRow.append(copy);
      const open = el("button", { className: "icon-btn" }, "↗");
      const targetUrl = `https://${d.ascii}/`;
      open.title = `Open ${targetUrl} in a new tab`;
      open.addEventListener("click", () => {
        void browser.tabs.create({ url: targetUrl });
      });
      titleRow.append(open);
      const refresh = el("button", { className: "icon-btn" }, "↻");
      refresh.title = "Refresh — re-fetch all sources, bypassing the cache";
      refresh.addEventListener("click", () => {
        const msg: RefreshMessage = { type: "refresh", force: true };
        void browser.runtime.sendMessage(msg);
      });
      titleRow.append(refresh);
      const header = section("domain-header", [titleRow]);
      const upperText = d.display.toUpperCase();
      if (upperText !== d.display) {
        const upperEl = el("div", { className: "muted domain-upper" }, upperText);
        makeCopyable(upperEl, upperText);
        header.append(upperEl);
      }
      if (d.ascii !== d.display) {
        const asciiEl = el("div", { className: "muted mono" }, d.ascii);
        makeCopyable(asciiEl, d.ascii);
        header.append(asciiEl);
      }
      const parts: string[] = [];
      if (d.subdomains !== "") parts.push(`subdomain of ${d.registrableDomain}`);
      if (d.isIdn) parts.push("IDN");
      if (parts.length > 0) header.append(el("div", { className: "muted" }, parts.join(" · ")));

      // A builder returns null when its section has nothing to say.
      const builders: Record<SectionId, () => HTMLElement | null> = {
        pills: () => pillsRow(state.dns, state.rdap),
        preview: () => previewSection(state.meta),
        score: () => scoreSection(state.score),
        history: () => archiveSection(state.wayback, state.rdap),
        research: () => researchSection(d),
        registration: () => registrationSection(state.rdap, d.publicSuffix),
        dns: () => dnsSection(state.dns),
        recent: () => recentSection(d.ascii),
      };
      const nodes: HTMLElement[] = [header];
      for (const sec of layout) {
        if (!sec.enabled) continue;
        const node = builders[sec.id]();
        if (node !== null) nodes.push(node);
      }
      app.append(...nodes);
      return;
    }
  }
}

function previewSection(meta: SourceState<SiteMetadata>): HTMLElement {
  const s = section("card preview", []);
  switch (meta.status) {
    case "loading":
      s.append(el("p", { className: "muted" }, "Loading site preview…"));
      return s;
    case "unavailable":
      s.append(el("p", { className: "muted" }, "Site unreachable — no preview."));
      return s;
    case "needs-permission":
      s.append(el("p", { className: "muted" }, "Needs site access to load the preview."));
      s.append(grantButton(["<all_urls>"]));
      return s;
    case "ok":
      break;
  }

  const m = meta.data;
  if (m.ogImage !== undefined) {
    const img = el("img", { className: "preview-img" });
    img.src = m.ogImage;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => img.remove());
    s.append(img);
  }
  if (m.title !== undefined) s.append(el("div", { className: "preview-title" }, m.title));
  if (m.description !== undefined) {
    s.append(el("p", { className: "muted preview-desc" }, m.description));
  }
  const urlLine = el("div", { className: "muted mono preview-url" });
  if (m.themeColor !== undefined) {
    const swatch = el("span", { className: "swatch" });
    swatch.style.background = m.themeColor;
    urlLine.append(swatch);
  }
  urlLine.append(document.createTextNode(m.finalUrl));
  s.append(urlLine);
  if (m.crossDomain) {
    s.append(el("div", { className: "flags warn" }, "⚠ redirects off-domain"));
  }
  if (s.childElementCount === 0) {
    s.append(el("p", { className: "muted" }, "No metadata on the site root."));
  }
  return s;
}

function grantButton(origins: string[]): HTMLElement {
  const btn = el("button", { className: "btn" }, "Grant access");
  btn.addEventListener("click", () => {
    void browser.permissions
      .request({ origins })
      .then((granted) => {
        if (granted) {
          const msg: RefreshMessage = { type: "refresh" };
          void browser.runtime.sendMessage(msg);
        }
      })
      .catch(() => {
        btn.replaceWith(
          el("p", { className: "muted" }, "Enable site access for this extension in the browser's add-on settings, then re-select the domain."),
        );
      });
  });
  return btn;
}

function pillsRow(dns: SourceState<DnsSummary>, rdap: SourceState<RdapResult>): HTMLElement {
  const row = el("div", { className: "pills" });
  if (rdap.status === "ok") {
    if (rdap.data.kind === "registered") {
      row.append(el("span", { className: "pill" }, "Registered"));
      const reg = rdap.data.data;
      if (reg.statuses.includes("pendingDelete")) {
        row.append(el("span", { className: "pill pill--low" }, "Pending delete"));
      } else if (reg.statuses.includes("redemptionPeriod")) {
        row.append(el("span", { className: "pill pill--low" }, "Redemption period"));
      } else if (reg.expires !== undefined) {
        const days = daysUntil(reg.expires);
        if (days !== null && days >= 0 && days <= 30) {
          row.append(el("span", { className: "pill pill--mid" }, `Expires in ${days}d`));
        }
      }
    } else if (rdap.data.kind === "unregistered") {
      row.append(el("span", { className: "pill pill--good" }, "Available"));
    }
  }
  if (dns.status === "ok") {
    const s = dns.data.signals;
    if (dns.data.status === "nxdomain") {
      row.append(el("span", { className: "pill pill--low" }, "NXDOMAIN"));
    } else if (s.parked !== null) {
      row.append(el("span", { className: "pill pill--mid" }, `Parked · ${s.parked.provider}`));
    } else if (s.delegated) {
      row.append(el("span", { className: "pill pill--good" }, "Delegated"));
    }
    if (s.hasEmail) row.append(el("span", { className: "pill" }, "Email"));
  }
  return row;
}

/** Registration link for a name RDAP reports as unregistered, pointing at the
 * registrar chosen in settings (defaults to the first one until loaded). */
function registerButton(ascii: string): HTMLElement {
  const reg = registrar ?? REGISTRARS[0]!;
  const link = el("a", { className: "btn btn-register" }, `Register on ${reg.name} ↗`);
  link.href = withUtm(registrarSearchUrl(reg, ascii));
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  return link;
}

function registrationSection(
  rdap: SourceState<RdapResult>,
  publicSuffix: string,
): HTMLElement | null {
  const s = section("card", [el("h2", {}, "Registration")]);
  switch (rdap.status) {
    case "loading":
      s.append(el("p", { className: "muted" }, "Fetching registration record…"));
      return s;
    case "unavailable":
    case "needs-permission":
      s.append(el("p", { className: "muted" }, "Registration data unavailable."));
      return s;
    case "ok":
      break;
  }

  const r = rdap.data;
  switch (r.kind) {
    case "no-rdap":
      s.append(el("p", { className: "muted" }, `No RDAP service for .${publicSuffix} — registration data can't be fetched without keys.`));
      return s;
    case "unknown":
      s.append(el("p", { className: "muted" }, "Registration data unavailable (registry didn't answer conclusively)."));
      return s;
    case "unregistered":
      // Nothing to report but the good news, and that already shows as the
      // "Available" pill plus the register bar pinned at the bottom.
      return null;
    case "registered":
      break;
  }

  const d = r.data;
  if (d.created !== undefined) s.append(kv("Created", `${fmtDate(d.created)}${age(d.created)}`));
  if (d.expires !== undefined) {
    const days = daysUntil(d.expires);
    let cls: string | undefined;
    let note = "";
    if (days !== null) {
      if (days < 0) {
        cls = "val-danger";
        note = ` · expired ${-days}d ago`;
      } else if (days <= 30) {
        cls = "val-danger";
        note = ` · in ${days}d`;
      } else if (days <= 90) {
        cls = "val-warn";
        note = ` · in ${days}d`;
      }
    }
    s.append(kv("Expires", `${fmtDate(d.expires)}${note}`, cls));
  }
  if (d.changed !== undefined) s.append(kv("Updated", fmtDate(d.changed)));
  if (d.registrar?.name !== undefined) {
    const id = d.registrar.ianaId !== undefined ? ` (IANA #${d.registrar.ianaId})` : "";
    s.append(kv("Registrar", `${d.registrar.name}${id}`));
  }
  if (d.statuses.length > 0) {
    // Critical statuses (drop pipeline, holds) sort first so the preview
    // can't hide them behind "+n", and paint the row red.
    const critical = d.statuses.filter((st) => CRITICAL_STATUSES.has(st));
    const rest = d.statuses.filter((st) => !CRITICAL_STATUSES.has(st));
    s.append(
      kv(
        "Status",
        listPreview([...critical, ...rest]) ?? "",
        critical.length > 0 ? "val-danger" : undefined,
      ),
    );
  }
  if (d.nameservers.length > 0) s.append(kv("NS (registry)", listPreview(d.nameservers) ?? ""));
  if (d.dnssec !== null) s.append(kv("DNSSEC", d.dnssec ? "signed" : "unsigned"));
  return s;
}

function recentSection(currentAscii?: string): HTMLElement {
  const s = section("card", []);
  s.id = "recent-section";
  if (currentAscii !== undefined) s.dataset["current"] = currentAscii;
  const entries = history.filter((e) => e.ascii !== currentAscii);
  if (entries.length === 0) {
    s.classList.add("hidden");
    return s;
  }
  const head = el("div", { className: "history-head" });
  head.append(el("h2", {}, "Recent"));
  const clear = el("button", { className: "icon-btn" }, "✕");
  clear.title = "Clear history";
  clear.addEventListener("click", () => void clearHistory());
  head.append(clear);
  const chips = el("div", { className: "chips" });
  for (const entry of entries) {
    const chip = el("button", { className: "chip" }, entry.display);
    chip.title = entry.ascii;
    chip.addEventListener("click", () => {
      const msg: SelectionMessage = { type: "selection", text: entry.ascii };
      void browser.runtime.sendMessage(msg);
    });
    chips.append(chip);
  }
  s.append(head, chips);
  return s;
}

function refreshHistorySection(): void {
  const existing = document.getElementById("recent-section");
  if (existing !== null) {
    existing.replaceWith(recentSection(existing.dataset["current"]));
  }
}

function makeCopyable(node: HTMLElement, text: string): void {
  node.classList.add("copyable");
  node.title = "Click to copy";
  node.addEventListener("click", () => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        node.classList.add("copied");
        window.setTimeout(() => node.classList.remove("copied"), 1200);
      })
      .catch(() => undefined);
  });
}

function flashGlyph(btn: HTMLElement, glyph: string): void {
  const original = btn.textContent;
  btn.textContent = glyph;
  window.setTimeout(() => {
    btn.textContent = original;
  }, 1200);
}

function buildSummary(state: DomainLookupState): string {
  const d = state.domain;
  const lines: string[] = [`## ${d.display}`];
  if (d.ascii !== d.display) lines.push(`Punycode: \`${d.ascii}\``);

  const words = state.score.features.segmentation.words;
  lines.push(`- Score: ${state.score.score}/100${words.length > 0 ? ` (${words.join("+")})` : ""}`);

  if (state.rdap.status === "ok") {
    const r = state.rdap.data;
    if (r.kind === "unregistered") lines.push("- Not registered — available");
    else if (r.kind === "no-rdap") lines.push(`- No RDAP service for .${d.publicSuffix}`);
    else if (r.kind === "registered") {
      const reg = r.data;
      const bits: string[] = [];
      if (reg.created !== undefined) bits.push(`created ${fmtDate(reg.created)}`);
      if (reg.expires !== undefined) bits.push(`expires ${fmtDate(reg.expires)}`);
      if (reg.registrar?.name !== undefined) {
        bits.push(
          `registrar ${reg.registrar.name}${reg.registrar.ianaId !== undefined ? ` (IANA #${reg.registrar.ianaId})` : ""}`,
        );
      }
      if (bits.length > 0) lines.push(`- Registered: ${bits.join(", ")}`);
      if (reg.statuses.length > 0) lines.push(`- Status: ${reg.statuses.join(", ")}`);
      if (reg.dnssec !== null) lines.push(`- DNSSEC: ${reg.dnssec ? "signed" : "unsigned"}`);
    }
  }

  if (state.dns.status === "ok") {
    const dns = state.dns.data;
    if (dns.status === "nxdomain") lines.push("- DNS: NXDOMAIN");
    else {
      if (dns.ns.length > 0) {
        const parked =
          dns.signals.parked !== null ? ` — parked at ${dns.signals.parked.provider}` : "";
        lines.push(`- NS: ${dns.ns.join(", ")}${parked}`);
      }
      if (dns.a.length > 0) lines.push(`- A: ${dns.a.join(", ")}`);
      lines.push(
        `- MX: ${dns.mx.length > 0 ? dns.mx.join(", ") : "none"} · SPF ${dns.signals.hasSpf ? "✓" : "✗"} · DMARC ${dns.signals.hasDmarc ? "✓" : "✗"}`,
      );
    }
  }

  if (state.meta.status === "ok" && state.meta.data.crossDomain) {
    lines.push(`- Redirects to: ${state.meta.data.finalUrl}`);
  }
  if (state.wayback.status === "ok" && state.wayback.data.first !== null) {
    lines.push(`- First archived: ${state.wayback.data.first.date}`);
  }
  lines.push(`- https://${d.ascii}/`);
  return lines.join("\n");
}

function archiveSection(
  wayback: SourceState<WaybackResult>,
  rdap: SourceState<RdapResult>,
): HTMLElement {
  const s = section("card", [el("h2", {}, "History")]);
  switch (wayback.status) {
    case "loading":
      s.append(el("p", { className: "muted" }, "Checking the Wayback Machine…"));
      return s;
    case "unavailable":
    case "needs-permission":
      s.append(el("p", { className: "muted" }, "Archive data unavailable."));
      return s;
    case "ok":
      break;
  }

  const first = wayback.data.first;
  if (first === null) {
    s.append(el("p", { className: "muted" }, "Never archived by the Wayback Machine."));
    return s;
  }

  const row = el("div", { className: "kv" });
  row.append(el("span", { className: "muted" }, "First archived"));
  const link = el("a", {}, `${first.date}${age(first.date)}`);
  link.href = withUtm(waybackLink(first.ts, first.original));
  link.target = "_blank";
  link.rel = "noreferrer";
  row.append(link);
  s.append(row);

  // Real age vs. registration age: an archive predating the current
  // registration means the name had a prior life (drop-caught, resold…).
  if (rdap.status === "ok" && rdap.data.kind === "registered") {
    const created = rdap.data.data.created;
    if (created !== undefined && first.date < created.slice(0, 10)) {
      s.append(
        el("div", { className: "flags muted" }, "Archived before the current registration — the name had a previous life."),
      );
    }
  }
  return s;
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

function age(iso: string): string {
  const years = (Date.now() - Date.parse(iso)) / (365.25 * 24 * 3600 * 1000);
  if (!Number.isFinite(years) || years < 1) return "";
  return ` · ${Math.floor(years)} yr${Math.floor(years) === 1 ? "" : "s"}`;
}

function dnsSection(dns: SourceState<DnsSummary>): HTMLElement {
  const s = section("card", [el("h2", {}, "DNS")]);
  switch (dns.status) {
    case "loading":
      s.append(el("p", { className: "muted" }, "Looking up DNS…"));
      return s;
    case "unavailable":
      s.append(el("p", { className: "muted" }, "DNS lookup unavailable."));
      return s;
    case "needs-permission":
      s.append(el("p", { className: "muted" }, "Needs permission to reach the DNS resolvers."));
      s.append(grantButton(DOH_ORIGINS));
      return s;
    case "ok":
      break;
  }

  const d = dns.data;
  if (d.status === "nxdomain") {
    s.append(el("p", { className: "muted" }, "NXDOMAIN — this name does not exist in DNS."));
    return s;
  }
  s.append(kv("NS", listPreview(d.ns) ?? "none — not delegated"));
  s.append(kv("A", listPreview(d.a) ?? "none"));
  s.append(kv("MX", listPreview(d.mx) ?? "none — no email"));
  s.append(kv("Email auth", `SPF ${d.signals.hasSpf ? "✓" : "✗"} · DMARC ${d.signals.hasDmarc ? "✓" : "✗"}`));
  if (d.signals.parked !== null) {
    s.append(
      el(
        "div",
        { className: "flags muted" },
        `Parked at ${d.signals.parked.provider} (${d.signals.parked.ns})`,
      ),
    );
  }
  return s;
}

function scoreBand(score: number): { fill: string; text: string; label: string } {
  if (score >= 70) return { fill: "var(--c-good)", text: "var(--t-good)", label: "Strong" };
  if (score >= 40) return { fill: "var(--c-warn)", text: "var(--t-warn)", label: "Fair" };
  return { fill: "var(--c-danger)", text: "var(--t-danger)", label: "Weak" };
}

// Continuous red→green scale for a 0–100 percentage: hue sweeps 0° (red) to
// 120° (green), so low scores read as bad and high scores as good.
function meterColor(pct: number): string {
  const p = Math.max(0, Math.min(100, pct));
  return `hsl(${Math.round((p / 100) * 120)} 62% 45%)`;
}

function meterRow(label: string, pct: number): HTMLElement {
  const row = el("div", { className: "kv" });
  row.append(el("span", { className: "muted" }, label));
  const cell = el("div", { className: "meter-cell" });
  const bar = el("div", { className: "meter" });
  const fill = el("div", { className: "meter-fill" });
  const color = meterColor(pct);
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  fill.style.background = color;
  bar.append(fill);
  const pctText = el("span", {}, `${pct}%`);
  pctText.style.color = color;
  cell.append(pctText, bar);
  row.append(cell);
  return row;
}

function listPreview(items: string[], max = 2): string | null {
  if (items.length === 0) return null;
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown} +${items.length - max}` : shown;
}

function scoreSection(score: ScoreResult): HTMLElement {
  const f = score.features;
  const s = section("card", [el("h2", {}, "Local score")]);

  const band = scoreBand(score.score);
  const gauge = el("div", { className: "score-gauge" });
  gauge.style.setProperty("--pct", String(Math.max(0, Math.min(100, score.score))));
  gauge.style.setProperty("--gauge", band.fill);
  const inner = el("div", { className: "score-gauge-inner" }, String(score.score));
  inner.style.color = band.text;
  gauge.append(inner);

  const heroText = el("div", { className: "score-hero-text" });
  const bandLabel = el("div", { className: "score-band" }, band.label);
  bandLabel.style.color = band.text;
  heroText.append(bandLabel, el("div", { className: "muted" }, "Composite of 6 local signals"));

  const hero = el("div", { className: "score-hero" });
  hero.append(gauge, heroText);
  s.append(hero);

  const words =
    f.segmentation.words.length > 0
      ? f.segmentation.parts.map((p) => (p.isWord ? p.text : `⟨${p.text}⟩`)).join(" + ")
      : "—";
  s.append(kv("Words", words));
  s.append(meterRow("Pronounceable", Math.round(f.pronounceability * 100)));
  s.append(kv("Pattern", f.cvPattern !== null ? `${f.charClasses} · ${f.cvPattern}` : f.charClasses));
  s.append(kv("Length", String(f.length)));

  if (score.flags.length > 0) {
    const isRisk = score.flags.includes("homograph");
    const line = el("div", { className: isRisk ? "flags warn" : "flags muted" });
    const labels: Record<string, string> = {
      hyphens: "has hyphens",
      digits: "has digits",
      idn: "internationalized (IDN)",
      homograph: "⚠ lookalike / mixed-script characters",
    };
    line.textContent = score.flags.map((fl) => labels[fl] ?? fl).join(" · ");
    s.append(line);
  }
  return s;
}

// The "Research" card: nominative links to third-party tools for this domain
// (plain text names, no logos, no implied affiliation, no referral codes). The
// tool table, each tool's subject (full registrable domain vs. the label alone,
// for tools that look across TLDs), and which are enabled live in
// shared/research-links.ts — some ship off by default. A wrong or blocked route
// just renders that site's own error, so it degrades gracefully. The card is
// dropped entirely when every tool is switched off.
function researchSection(d: DomainLookupState["domain"]): HTMLElement | null {
  const tools = enabledResearchTools(researchLinks);
  if (tools.length === 0) return null;
  const s = section("card", [el("h2", {}, "Research")]);
  for (const tool of tools) {
    s.append(extItem(tool.label, researchToolUrl(tool, d), tool.note));
  }
  return s;
}

// Tag every outbound third-party link so partner sites can attribute the
// referral back to us. Appends as a fresh query param, preserving any the URL
// already carries.
function withUtm(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}utm_source=extenddomains.com`;
}

function extItem(label: string, href: string, note: string): HTMLElement {
  const row = el("div", { className: "ext-item" });
  const link = el("a", { className: "ext-tool" }, `${label} ↗`);
  link.href = withUtm(href);
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  row.append(link, el("span", { className: "ext-note" }, note));
  return row;
}

const CRITICAL_STATUSES = new Set([
  "pendingDelete",
  "redemptionPeriod",
  "serverHold",
  "clientHold",
]);

function daysUntil(iso: string): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / (24 * 3600 * 1000));
}

function kv(key: string, value: string, valueClass?: string): HTMLElement {
  const row = el("div", { className: "kv" });
  row.append(el("span", { className: "muted" }, key), el("span", { ...(valueClass !== undefined ? { className: valueClass } : {}) }, value));
  return row;
}

function section(className: string, children: readonly HTMLElement[]): HTMLElement {
  const s = el("section", { className });
  s.append(...children);
  return s;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string },
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className !== undefined) node.className = props.className;
  if (text !== undefined) node.textContent = text;
  return node;
}
