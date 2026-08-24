// Cross-browser sidebar-opening adapter. This is one of the few intentional
// divergence points between the two builds (see README, "Cross-browser notes").
//
// Chrome: chrome.sidePanel.open() may only be called in response to a user
// gesture, and the gesture does not survive the async hop from a content-script
// message to the service worker. So the panel opens via toolbar click
// (setPanelBehavior) and the context-menu item — never automatically on
// selection.
//
// Firefox: sidebarAction.open()/toggle() has the same user-input restriction;
// the toolbar button toggles the sidebar, the context-menu item opens it.

import browser, { type Tabs } from "webextension-polyfill";

interface ChromeSidePanel {
  open(options: { windowId?: number; tabId?: number }): Promise<void>;
  setPanelBehavior(behavior: { openPanelOnActionClick: boolean }): Promise<void>;
}

function chromeSidePanel(): ChromeSidePanel | undefined {
  return (globalThis as { chrome?: { sidePanel?: ChromeSidePanel } }).chrome?.sidePanel;
}

export function initPanelOpenBehavior(): void {
  const sidePanel = chromeSidePanel();
  if (sidePanel) {
    void sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err: unknown) => {
      console.warn("setPanelBehavior failed:", err);
    });
    return;
  }
  browser.action.onClicked.addListener(() => {
    void browser.sidebarAction.toggle().catch(() => undefined);
  });
}

/**
 * Must be called synchronously inside a context-menu click handler — an
 * `await` before this call consumes the user-gesture scope and both browsers
 * will refuse to open the panel.
 */
export function openPanelFromMenuClick(tab: Tabs.Tab | undefined): void {
  const sidePanel = chromeSidePanel();
  if (sidePanel) {
    if (tab?.windowId !== undefined) {
      void sidePanel.open({ windowId: tab.windowId }).catch((err: unknown) => {
        console.warn("sidePanel.open failed:", err);
      });
    }
    return;
  }
  void browser.sidebarAction.open().catch((err: unknown) => {
    console.warn("sidebarAction.open failed:", err);
  });
}
