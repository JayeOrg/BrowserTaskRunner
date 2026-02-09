import { log } from "./logging.js";

export async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error("No active tab");
  }
  return tab;
}

export function getTabId(tab: chrome.tabs.Tab): number {
  if (tab.id === undefined) {
    throw new Error("Tab has no ID (possibly a devtools or extension tab)");
  }
  return tab.id;
}

export interface TabLoadResult {
  loaded: boolean;
  timedOut: boolean;
}

// Delay after tab reports "complete" to let post-load JavaScript settle
const POST_LOAD_SETTLE_MS = 500;

export function waitForTabLoad(tabId: number, timeoutMs = 30000): Promise<TabLoadResult> {
  return new Promise<TabLoadResult>((resolve) => {
    let resolved = false;

    const listener = (changedTabId: number, changeInfo: { status?: string }) => {
      if (changedTabId === tabId && changeInfo.status === "complete" && !resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(() => {
          resolve({ loaded: true, timedOut: false });
        }, POST_LOAD_SETTLE_MS);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        log("Tab load timed out", { timeoutMs });
        resolve({ loaded: false, timedOut: true });
      }
    }, timeoutMs);
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
