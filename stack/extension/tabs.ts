import { log } from "./logging.js";

let tabIdPromise: Promise<number> | null = null;
let lockedTabId: number | null = null;

async function resolveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error("No active tab");
  }
  if (tab.id === undefined) {
    throw new Error("Tab has no ID (possibly a devtools or extension tab)");
  }
  lockedTabId = tab.id;
  log("Locked to tab", { tabId: tab.id });
  return tab.id;
}

export function getActiveTabId(): Promise<number> {
  if (!tabIdPromise) {
    tabIdPromise = resolveTabId();
  }
  return tabIdPromise;
}

export function getLockedTabId(): number | null {
  return lockedTabId;
}

export interface TabLoadResult {
  loaded: boolean;
  timedOut: boolean;
}

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
