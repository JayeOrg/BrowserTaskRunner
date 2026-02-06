import type { BaseCommand, IncomingCommand } from "./base.js";
import { getActiveTab, getTabId } from "../../tabs.js";
import { isScriptFound } from "../../script-results.js";

export interface WaitForSelectorCommand extends BaseCommand {
  type: "waitForSelector";
  selector: string;
  timeout?: number;
}

export type WaitForSelectorResponse = {
  type: "waitForSelector";
  id?: number;
  error?: string;
} & ({ found: true; selector: string } | { found: false; timedOut?: boolean });

export async function handleWaitForSelectorCommand(
  msg: IncomingCommand,
): Promise<WaitForSelectorResponse> {
  if (typeof msg.selector !== "string") {
    return {
      type: "waitForSelector",
      found: false,
      error: "Missing selector parameter",
    };
  }
  const timeout = typeof msg.timeout === "number" ? msg.timeout : 10000;
  return handleWaitForSelector(msg.selector, timeout);
}

async function handleWaitForSelector(
  selector: string,
  timeout: number,
): Promise<WaitForSelectorResponse> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (sel: string, timeoutMs: number) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const element = document.querySelector(sel);
        if (element) {
          return { found: true };
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });
      }
      return { found: false, timedOut: true };
    },
    args: [selector, timeout],
  });
  const result = results[0]?.result;
  if (isScriptFound(result)) {
    if (result.found) {
      return { type: "waitForSelector", found: true, selector };
    }
    return {
      type: "waitForSelector",
      found: false,
      ...(result.timedOut ? { timedOut: true } : {}),
    };
  }
  return {
    type: "waitForSelector",
    found: false,
    error: "Script execution failed",
  };
}
