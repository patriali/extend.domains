// Options page: every knob in ScorerWeights as a form, persisted via
// shared/weights.ts, with a live scorer for feedback. Pure-local — the page
// bundles the scorer itself and never touches the network.

import browser from "webextension-polyfill";

import { loadBuyNow, saveBuyNow } from "../shared/buy-now";
import {
  type DeobfuscationSettings,
  loadDeobfuscation,
  saveDeobfuscation,
} from "../shared/deobfuscation";
import { parseDomainCandidate } from "../lib/domain";
import { scoreDomain, type ScorerWeights } from "../lib/scorer";
import { SECTION_LABELS, type SectionConfig } from "../shared/layout";
import { loadLayout, resetLayout, saveLayout } from "../shared/layout-store";
import { loadRegistrar, REGISTRARS, saveRegistrar } from "../shared/registrar";
import { RESEARCH_TOOLS, type ResearchLinkSettings } from "../shared/research-links";
import {
  loadResearchLinks,
  resetResearchLinks,
  saveResearchLinks,
} from "../shared/research-links-store";
import { ALL_ORIGINS, hasAccess } from "../shared/net-permissions";
import { initTheme, isTheme, loadTheme, saveTheme, type Theme } from "../shared/theme";
import { loadWeights, mergeWeights, resetWeights, saveWeights } from "../shared/weights";

// ── Theme ─────────────────────────────────────────────────────────────────────

initTheme();

const themeGroup = document.getElementById("theme")!;
function markTheme(active: Theme): void {
  for (const b of themeGroup.querySelectorAll<HTMLButtonElement>("[data-theme-choice]")) {
    b.setAttribute("aria-pressed", String(b.dataset["themeChoice"] === active));
  }
}
themeGroup.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-theme-choice]");
  const choice = btn?.dataset["themeChoice"];
  if (!isTheme(choice)) return;
  void saveTheme(choice).then(() => markTheme(choice));
});
void loadTheme().then(markTheme);

// ── Registrar ─────────────────────────────────────────────────────────────────

const registrarSelect = document.getElementById("registrar") as HTMLSelectElement;
for (const r of REGISTRARS) {
  registrarSelect.append(new Option(r.name, r.id));
}
registrarSelect.addEventListener("change", () => {
  void saveRegistrar(registrarSelect.value);
});
void loadRegistrar().then((reg) => {
  registrarSelect.value = reg.id;
});

// ── Site access ─────────────────────────────────────────────────────────────
// Firefox MV3 hands out no host permissions at install, so without this the
// only route to a working lookup is triggering a failure in the sidebar and
// using the grant button there. The request needs a user gesture, which is why
// it lives on a page and not in the background.

const accessStatus = document.getElementById("access-status")!;
const accessGrant = document.getElementById("access-grant") as HTMLButtonElement;

function reflectAccess(granted: boolean): void {
  accessStatus.textContent = granted
    ? "Granted"
    : "DNS, preview, and archive lookups are blocked";
  accessGrant.hidden = granted;
}

accessGrant.addEventListener("click", () => {
  void browser.permissions
    .request({ origins: ALL_ORIGINS })
    .then(reflectAccess)
    .catch(() => {
      accessStatus.textContent = "Grant site access in the browser's add-on settings";
      accessGrant.hidden = true;
    });
});

void hasAccess(ALL_ORIGINS).then(reflectAccess);

// ── Buy now button ──────────────────────────────────────────────────────────

const buyNowEnabled = document.getElementById("buy-now-enabled") as HTMLInputElement;
buyNowEnabled.addEventListener("change", () => {
  void saveBuyNow(buyNowEnabled.checked);
});
void loadBuyNow().then((on) => {
  buyNowEnabled.checked = on;
});

// ── Obfuscated-domain detection ─────────────────────────────────────────────

const deobEnabled = document.getElementById("deob-enabled") as HTMLInputElement;
const deobSpaces = document.getElementById("deob-spaces") as HTMLInputElement;

function reflectDeob(s: DeobfuscationSettings): void {
  deobEnabled.checked = s.enabled;
  deobSpaces.checked = s.spaces;
  deobSpaces.disabled = !s.enabled; // "spaces" only applies while enabled
  deobSpaces.closest(".opt-row")!.classList.toggle("disabled", !s.enabled);
}

function saveDeob(): void {
  const s: DeobfuscationSettings = {
    enabled: deobEnabled.checked,
    spaces: deobEnabled.checked && deobSpaces.checked,
  };
  void saveDeobfuscation(s).then(() => reflectDeob(s));
}

deobEnabled.addEventListener("change", saveDeob);
deobSpaces.addEventListener("change", saveDeob);
void loadDeobfuscation().then(reflectDeob);

// ── Tabs ────────────────────────────────────────────────────────────────────

const tabs = document.getElementById("tabs")!;
tabs.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".tab");
  if (btn === null) return;
  const name = btn.dataset["tab"];
  for (const t of tabs.querySelectorAll<HTMLButtonElement>(".tab")) {
    t.setAttribute("aria-selected", String(t === btn));
  }
  for (const panel of document.querySelectorAll<HTMLElement>(".tab-panel")) {
    panel.hidden = panel.dataset["panel"] !== name;
  }
});

// ── Layout editor ─────────────────────────────────────────────────────────────

const layoutList = document.getElementById("layout-list") as HTMLUListElement;

function renderLayoutEditor(list: SectionConfig[]): void {
  layoutList.replaceChildren();
  list.forEach((sec, i) => {
    const li = document.createElement("li");
    li.className = "layout-row";

    const toggle = document.createElement("label");
    toggle.className = "layout-toggle";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = sec.enabled;
    check.addEventListener("change", () => {
      const next = list.map((s, j) => (j === i ? { ...s, enabled: check.checked } : s));
      void saveLayout(next).then(() => renderLayoutEditor(next));
    });
    const name = document.createElement("span");
    name.textContent = SECTION_LABELS[sec.id];
    if (!sec.enabled) name.classList.add("disabled");
    toggle.append(check, name);

    const moves = document.createElement("div");
    moves.className = "layout-moves";
    moves.append(
      moveButton("↑", i === 0, () => reorder(list, i, i - 1)),
      moveButton("↓", i === list.length - 1, () => reorder(list, i, i + 1)),
    );

    li.append(toggle, moves);
    layoutList.append(li);
  });
}

function moveButton(glyph: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "move-btn";
  b.textContent = glyph;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

function reorder(list: SectionConfig[], from: number, to: number): void {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  void saveLayout(next).then(() => renderLayoutEditor(next));
}

document.getElementById("layout-reset")!.addEventListener("click", () => {
  void resetLayout()
    .then(loadLayout)
    .then(renderLayoutEditor);
});

void loadLayout().then(renderLayoutEditor);

// ── Research links ────────────────────────────────────────────────────────────

const researchList = document.getElementById("research-list") as HTMLUListElement;

function renderResearchEditor(settings: ResearchLinkSettings): void {
  researchList.replaceChildren();
  for (const tool of RESEARCH_TOOLS) {
    const li = document.createElement("li");
    li.className = "opt-row";

    const toggle = document.createElement("label");
    toggle.className = "opt-toggle";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = settings[tool.id] ?? tool.defaultEnabled;
    check.addEventListener("change", () => {
      const next = { ...settings, [tool.id]: check.checked };
      void saveResearchLinks(next).then(() => renderResearchEditor(next));
    });

    const text = document.createElement("span");
    const name = document.createElement("span");
    name.textContent = tool.label;
    const host = document.createElement("small");
    host.className = "muted";
    host.textContent = `${new URL(tool.template).host} · ${tool.note}`;
    text.append(name, host);

    toggle.append(check, text);
    li.append(toggle);
    researchList.append(li);
  }
}

document.getElementById("research-reset")!.addEventListener("click", () => {
  void resetResearchLinks().then(loadResearchLinks).then(renderResearchEditor);
});

void loadResearchLinks().then(renderResearchEditor);

const form = document.getElementById("form") as HTMLFormElement;
const statusEl = document.getElementById("status")!;
const tldTextarea = document.getElementById("tld-scores") as HTMLTextAreaElement;

interface NumField {
  input: HTMLInputElement;
  read: () => number;
}

function numField(
  fieldsetId: string,
  label: string,
  value: number,
  opts: { step?: number; min?: number; max?: number } = {},
): NumField {
  const wrap = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.step = String(opts.step ?? 1);
  input.min = String(opts.min ?? 0);
  if (opts.max !== undefined) input.max = String(opts.max);
  input.value = String(value);
  wrap.append(span, input);
  document.getElementById(fieldsetId)!.append(wrap);
  const fallback = value;
  return {
    input,
    read: () => {
      const n = Number(input.value);
      return Number.isFinite(n) ? Math.max(opts.min ?? 0, n) : fallback;
    },
  };
}

let fields: ReturnType<typeof buildForm> | null = null;

function buildForm(w: ScorerWeights) {
  const pen = { step: 0.05, min: 0, max: 1 };
  return {
    wLength: numField("fs-weights", "Length", w.weights.length),
    wWords: numField("fs-weights", "Words", w.weights.words),
    wPron: numField("fs-weights", "Pronounceability", w.weights.pronounceability),
    wComp: numField("fs-weights", "Composition", w.weights.composition),
    wTld: numField("fs-weights", "TLD", w.weights.tld),
    wPattern: numField("fs-weights", "Short pattern", w.weights.pattern),
    idealLength: numField("fs-curve", "Ideal length ≤", w.idealLength, { min: 1 }),
    maxLength: numField("fs-curve", "Zero score at", w.maxLength, { min: 2 }),
    hyphenPenalty: numField("fs-penalties", "Per hyphen", w.hyphenPenalty, pen),
    digitPenalty: numField("fs-penalties", "Per digit", w.digitPenalty, pen),
    idnPenalty: numField("fs-penalties", "IDN", w.idnPenalty, pen),
    homographPenalty: numField("fs-penalties", "Homograph", w.homographPenalty, pen),
    defaultTld: numField("fs-tld-default", "Unlisted TLDs", w.defaultTldScore, pen),
  };
}

function fillNonFields(w: ScorerWeights): void {
  tldTextarea.value = Object.entries(w.tldScores)
    .map(([tld, v]) => `${tld} ${v}`)
    .join("\n");
  factorsInput.value = w.wordCountFactors.join(", ");
}

// wordCountFactors gets a text input in the words fieldset.
const factorsWrap = document.createElement("label");
factorsWrap.className = "stack";
const factorsLabel = document.createElement("span");
factorsLabel.textContent = "Word-count factors (1 word, 2 words, …; last repeats)";
const factorsInput = document.createElement("input");
factorsInput.type = "text";
factorsInput.spellcheck = false;
factorsWrap.append(factorsLabel, factorsInput);
document.getElementById("fs-words")!.append(factorsWrap);

function collect(): ScorerWeights {
  const f = fields!;
  const tldScores: Record<string, number> = {};
  for (const line of tldTextarea.value.split("\n")) {
    const m = line.trim().match(/^\.?([a-z0-9-]+)\s+([\d.]+)$/i);
    if (m === null) continue;
    const v = Number(m[2]);
    if (Number.isFinite(v)) tldScores[m[1]!.toLowerCase()] = Math.min(1, Math.max(0, v));
  }
  const wordCountFactors = factorsInput.value
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return mergeWeights({
    weights: {
      length: f.wLength.read(),
      words: f.wWords.read(),
      pronounceability: f.wPron.read(),
      composition: f.wComp.read(),
      tld: f.wTld.read(),
      pattern: f.wPattern.read(),
    },
    idealLength: f.idealLength.read(),
    maxLength: Math.max(f.maxLength.read(), f.idealLength.read() + 1),
    hyphenPenalty: f.hyphenPenalty.read(),
    digitPenalty: f.digitPenalty.read(),
    idnPenalty: f.idnPenalty.read(),
    homographPenalty: f.homographPenalty.read(),
    defaultTldScore: f.defaultTld.read(),
    ...(Object.keys(tldScores).length > 0 ? { tldScores } : {}),
    ...(wordCountFactors.length > 0 ? { wordCountFactors } : {}),
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  void saveWeights(collect()).then(() => flash("Saved."));
});

document.getElementById("reset")!.addEventListener("click", () => {
  void resetWeights().then(async () => {
    await init(true);
    flash("Defaults restored.");
  });
});

let flashTimer: number | undefined;
function flash(text: string): void {
  statusEl.textContent = text;
  if (flashTimer !== undefined) window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    statusEl.textContent = "";
  }, 2000);
}

// --- Try it -----------------------------------------------------------------

const tryInput = document.getElementById("try-input") as HTMLInputElement;
const tryScore = document.getElementById("try-score")!;
const tryBreakdown = document.getElementById("try-breakdown")!;

function renderTry(): void {
  const parsed = parseDomainCandidate(tryInput.value);
  if (parsed === null) {
    tryScore.textContent = "–";
    tryBreakdown.textContent = tryInput.value.trim() === "" ? "" : "not a registrable domain";
    return;
  }
  const r = scoreDomain(
    { label: parsed.label, publicSuffix: parsed.publicSuffix, caseLabel: parsed.caseLabel },
    collect(),
  );
  tryScore.textContent = String(r.score);
  const parts = r.components.map((c) => `${c.id} ${c.points.toFixed(1)}`);
  if (r.penaltyMultiplier !== 1) parts.push(`×${r.penaltyMultiplier.toFixed(2)} penalty`);
  const words = r.features.segmentation.words;
  if (words.length > 0) parts.push(`[${words.join("+")}]`);
  tryBreakdown.textContent = parts.join(" · ");
}

tryInput.addEventListener("input", renderTry);
form.addEventListener("input", renderTry);

// --- Init -------------------------------------------------------------------

async function init(rebuild = false): Promise<void> {
  const w = await loadWeights();
  if (rebuild) {
    for (const id of ["fs-weights", "fs-curve", "fs-penalties", "fs-tld-default"]) {
      document.getElementById(id)!.querySelectorAll("label").forEach((n) => n.remove());
    }
    fields = null;
  }
  fields ??= buildForm(w);
  fillNonFields(w);
  renderTry();
}

void init();
