// Theme preference (System / Light / Dark), persisted in storage.local and
// applied to <html> via a data-theme attribute. In System mode the attribute
// is left unset so the CSS `prefers-color-scheme` media query governs (no
// flash, auto-updates); Light/Dark set the attribute to override it.

import browser from "webextension-polyfill";

export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "theme";

export function isTheme(v: unknown): v is Theme {
  return v === "system" || v === "light" || v === "dark";
}

export async function loadTheme(): Promise<Theme> {
  const stored = await browser.storage.local.get(THEME_KEY);
  const t = stored[THEME_KEY];
  return isTheme(t) ? t : "system";
}

export async function saveTheme(theme: Theme): Promise<void> {
  await browser.storage.local.set({ [THEME_KEY]: theme });
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset["theme"];
  else root.dataset["theme"] = theme;
}

/** Applies the stored theme now and keeps it in sync on change. Call once per
 * document (sidebar, options). */
export function initTheme(): void {
  void loadTheme().then(applyTheme);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && THEME_KEY in changes) {
      void loadTheme().then(applyTheme);
    }
  });
}
