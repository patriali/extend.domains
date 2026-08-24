// Selection listener, injected into every page — so it is deliberately
// dependency-free (no webextension-polyfill: that would add ~10 kB of parse
// cost to every page load for one fire-and-forget sendMessage, which is
// promise-returning in both browsers' MV3 anyway).
//
// Gate order: debounce → cheap "contains a domain-shaped token?" scan → send
// the whole selection to the background, which extracts the first PSL-valid
// domain from it (the suffix data is ~130 kB; bundling it per-page is the
// wrong trade). So a domain highlighted mid-sentence is caught, not just a
// selection that is exactly a domain. Nothing user-visible happens unless the
// background validates a candidate.

import {
  DEOBFUSCATION_KEY,
  type DeobfuscationSettings,
  hasDeobfuscatedCandidate,
  normalizeDeobfuscation,
} from "../lib/deobfuscate";
import { hasDomainCandidate } from "../lib/domain-pattern";
import type { SelectionMessage } from "../shared/messages";

type OnMessage = (
  cb: (
    msg: unknown,
    sender: unknown,
    sendResponse: (response?: unknown) => void,
  ) => boolean | void,
) => void;

interface RuntimeLite {
  runtime: {
    sendMessage(msg: unknown): Promise<unknown>;
    onMessage: { addListener: OnMessage };
  };
  storage: {
    local: { get(keys: string): Promise<Record<string, unknown>> };
    onChanged: {
      addListener(
        cb: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
      ): void;
    };
  };
}

const ext = ((globalThis as { browser?: RuntimeLite }).browser ??
  (globalThis as { chrome?: RuntimeLite }).chrome)!;

// Opt-in obfuscated-domain detection. Cached here so the per-selection gate
// stays synchronous; kept in sync via storage.onChanged. Default (disabled)
// short-circuits the gate below to zero extra work for users who never enable
// it. Accessed via the raw namespace (not the polyfill) to keep this per-page
// bundle small; storage.local.get returns a promise in both browsers' MV3.
let deob: DeobfuscationSettings = { enabled: false, spaces: false };
void ext.storage.local
  .get(DEOBFUSCATION_KEY)
  .then((r) => {
    deob = normalizeDeobfuscation(r[DEOBFUSCATION_KEY]);
  })
  .catch(() => undefined);
ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && DEOBFUSCATION_KEY in changes) {
    deob = normalizeDeobfuscation(changes[DEOBFUSCATION_KEY]?.newValue);
  }
});

// A selection is worth sending if it looks like a plain domain, or — when the
// user has opted in — if de-obfuscating it would produce one. The background
// re-validates against the PSL either way.
function hasCandidate(text: string): boolean {
  if (hasDomainCandidate(text)) return true;
  if (!deob.enabled) return false;
  return hasDeobfuscatedCandidate(text, { spaces: deob.spaces });
}

// The sidebar's "current tab" button asks the active tab's content script for
// its own URL (avoids needing the broad `tabs` permission).
ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if ((msg as { type?: string } | null)?.type === "getPageUrl") {
    sendResponse(location.href);
  }
});

const DEBOUNCE_MS = 250;
const MAX_LEN = 2000;
let timer: number | undefined;
let lastSent = "";

function scheduleCheck(): void {
  if (timer !== undefined) window.clearTimeout(timer);
  timer = window.setTimeout(checkSelection, DEBOUNCE_MS);
}

function checkSelection(): void {
  timer = undefined;
  const text = String(window.getSelection() ?? "").trim();
  if (text === "") {
    lastSent = ""; // allow re-selecting the same domain later
    return;
  }
  if (text === lastSent || text.length > MAX_LEN || !hasCandidate(text)) return;
  lastSent = text;
  const msg: SelectionMessage = { type: "selection", text };
  void ext.runtime.sendMessage(msg).catch(() => {
    // Background asleep mid-reload or extension updating — drop silently.
  });
}

document.addEventListener("mouseup", scheduleCheck);
document.addEventListener("selectionchange", scheduleCheck);
