import type { BaseCommand, IncomingCommand } from "./base.js";
import { getActiveTab, getTabId } from "../../tabs.js";
import { isScriptError } from "../../script-results.js";

export interface FillCommand extends BaseCommand {
  type: "fill";
  selector: string;
  value: string;
}

export type FillResponse = {
  type: "fill";
  id?: number;
  error?: string;
} & ({ success: true } | { success: false; error: string });

export async function handleFillCommand(
  msg: IncomingCommand,
): Promise<FillResponse> {
  if (typeof msg.selector !== "string" || typeof msg.value !== "string") {
    return {
      type: "fill",
      success: false,
      error: "Missing selector or value parameter",
    };
  }
  return handleFill(msg.selector, msg.value);
}

async function handleFill(
  selector: string,
  value: string,
): Promise<FillResponse> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string, val: string) => {
      const element = document.querySelector(sel);
      if (!element) {
        return { error: `Element not found: ${sel}` };
      }
      if (!(element instanceof HTMLInputElement)) {
        return { error: `Element is not an input: ${sel}` };
      }
      element.focus();
      element.value = val;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { success: true };
    },
    args: [selector, value],
  });
  const result = results[0]?.result;
  if (isScriptError(result)) {
    return { type: "fill", success: false, error: result.error };
  }
  return { type: "fill", success: true };
}
