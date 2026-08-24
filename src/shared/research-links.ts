// The third-party tools listed in the sidebar's "Research" card: which ones
// exist, and which are switched on. Which ones are on is persisted in
// storage.local as a map of id → enabled (see research-links-store.ts); the
// options page edits it and the sidebar re-renders on change.
//
// This module stays pure (no extension imports) so normalizeResearchLinks is
// unit-testable.
//
// Each tool is nominative only — plain text name, no logo, no referral code —
// and takes either the full registrable domain (`domain`) or the second-level
// label alone (`label`, for tools whose subject is the name across TLDs).

export interface ResearchTool {
  id: string;
  /** Link text in the sidebar, minus the ↗ glyph. */
  label: string;
  /** Short grey note after the link. */
  note: string;
  /** What `{q}` stands for: the registrable domain, or just its label. */
  scope: "domain" | "label";
  /** Target URL; `{q}` is replaced by the URL-encoded subject. */
  template: string;
  /** Whether the tool shows for someone who has never touched this setting. */
  defaultEnabled: boolean;
}

export const RESEARCH_TOOLS: readonly ResearchTool[] = [
  {
    id: "atom",
    label: "Appraise on Atom.com",
    note: "valuation",
    scope: "domain",
    template: "https://www.atom.com/domain-appraisal/{q}",
    defaultEnabled: true,
  },
  {
    id: "namebio",
    label: "NameBio sale history",
    note: "comparable sales",
    scope: "domain",
    template: "https://namebio.com/{q}",
    defaultEnabled: true,
  },
  {
    id: "dotdb",
    label: "DotDB name usage",
    note: "across TLDs",
    scope: "label",
    template: "https://dotdb.com/search?keyword={q}&position=any",
    defaultEnabled: true,
  },
  {
    id: "wipo",
    label: "WIPO UDRP decisions",
    note: "domain disputes",
    scope: "label",
    template: "https://www.wipo.int/amc/en/domains/search/fulltext_decisions.jsp?q={q}",
    defaultEnabled: true,
  },
  {
    id: "trademarkia",
    label: "Trademarkia search",
    note: "trademark check",
    scope: "label",
    template: "https://www.trademarkia.com/search/trademarks?query={q}",
    defaultEnabled: true,
  },
  {
    id: "ahrefs",
    label: "Ahrefs backlinks",
    note: "backlink profile",
    scope: "domain",
    template: "https://ahrefs.com/backlink-checker/?input={q}&mode=subdomains",
    defaultEnabled: false,
  },
];

export const RESEARCH_LINKS_KEY = "researchLinks";

export type ResearchLinkSettings = Record<string, boolean>;

/**
 * Reconciles a stored map with the current tool set: keeps stored flags for
 * tools that still exist, drops unknown ids, and falls back to each tool's
 * default so a newly added tool honours its own default rather than appearing
 * unannounced.
 */
export function normalizeResearchLinks(stored: unknown): ResearchLinkSettings {
  const raw = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  const out: ResearchLinkSettings = {};
  for (const tool of RESEARCH_TOOLS) {
    const v = raw[tool.id];
    out[tool.id] = typeof v === "boolean" ? v : tool.defaultEnabled;
  }
  return out;
}

/** The tools to render, in declaration order. */
export function enabledResearchTools(settings: ResearchLinkSettings): ResearchTool[] {
  return RESEARCH_TOOLS.filter((t) => settings[t.id] ?? t.defaultEnabled);
}

/** Builds a tool's URL for a domain, picking the subject its scope asks for. */
export function researchToolUrl(
  tool: ResearchTool,
  d: { registrableDomain: string; label: string },
): string {
  const q = tool.scope === "domain" ? d.registrableDomain : d.label;
  return tool.template.replace("{q}", encodeURIComponent(q));
}
