import type { BaseCommand, IncomingCommand } from "./base.js";
import { getActiveTab, getTabId } from "../../tabs.js";
import { isScriptError } from "../../script-results.js";

export interface ClickCommand extends BaseCommand {
  type: "click";
  selector: string;
}

export type ClickResponse = {
  type: "click";
  id?: number;
  error?: string;
} & ({ success: true } | { success: false; error: string });

export async function handleClickCommand(
  msg: IncomingCommand,
): Promise<ClickResponse> {
  if (typeof msg.selector !== "string") {
    return {
      type: "click",
      success: false,
      error: "Missing selector parameter",
    };
  }
  return handleClick(msg.selector);
}

async function handleClick(selector: string): Promise<ClickResponse> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string) => {
      const element = document.querySelector(sel);
      if (!element) {
        return { error: `Element not found: ${sel}` };
      }

      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const eventOptions = {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        screenX: centerX + window.screenX,
        screenY: centerY + window.screenY,
        button: 0,
        buttons: 1,
      };

      element.dispatchEvent(new MouseEvent("mousedown", eventOptions));
      element.dispatchEvent(new MouseEvent("mouseup", eventOptions));
      element.dispatchEvent(new MouseEvent("click", eventOptions));

      return { success: true };
    },
    args: [selector],
  });
  const result = results[0]?.result;
  if (isScriptError(result)) {
    return { type: "click", success: false, error: result.error };
  }
  return { type: "click", success: true };
}
