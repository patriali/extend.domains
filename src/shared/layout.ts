// Sidebar block layout: which cards show and in what order. Persisted in
// storage.local (see layout-store.ts); the sidebar reads it and re-renders
// live on change; the options page edits it. The domain header (name, actions,
// search bar) is fixed and not part of this list.
//
// This module stays pure (no extension imports) so mergeLayout is unit-testable.

export type SectionId =
  | "pills"
  | "preview"
  | "score"
  | "history"
  | "research"
  | "registration"
  | "dns"
  | "recent";

export interface SectionConfig {
  id: SectionId;
  enabled: boolean;
}

export const SECTION_LABELS: Record<SectionId, string> = {
  pills: "Status pills",
  preview: "Site preview",
  score: "Local score",
  history: "History (archive)",
  research: "Research links",
  registration: "Registration",
  dns: "DNS",
  recent: "Recent lookups",
};

export const DEFAULT_LAYOUT: SectionConfig[] = [
  { id: "pills", enabled: true },
  { id: "preview", enabled: true },
  { id: "score", enabled: true },
  { id: "history", enabled: true },
  { id: "research", enabled: true },
  { id: "registration", enabled: true },
  { id: "dns", enabled: true },
  { id: "recent", enabled: true },
];

export const LAYOUT_STORAGE_KEY = "layout";

/**
 * Reconciles a stored layout with the current section set: preserves stored
 * order and enabled flags, drops unknown ids, and appends any sections added
 * since the layout was saved (in their default position) so upgrades never
 * silently hide a new block.
 */
export function mergeLayout(stored: unknown): SectionConfig[] {
  const known = new Set(Object.keys(SECTION_LABELS) as SectionId[]);
  const result: SectionConfig[] = [];
  const seen = new Set<SectionId>();

  if (Array.isArray(stored)) {
    for (const item of stored) {
      const id = (item as Partial<SectionConfig> | null)?.id;
      if (typeof id === "string" && known.has(id as SectionId) && !seen.has(id as SectionId)) {
        result.push({ id: id as SectionId, enabled: (item as SectionConfig).enabled !== false });
        seen.add(id as SectionId);
      }
    }
  }
  for (const def of DEFAULT_LAYOUT) {
    if (!seen.has(def.id)) result.push({ ...def });
  }
  return result;
}
