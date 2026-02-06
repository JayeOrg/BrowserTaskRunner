import type { BaseCommand, IncomingCommand } from "./base.js";
import { getActiveTab, getTabId } from "../../tabs.js";
import { isScriptFound } from "../../script-results.js";

export interface QuerySelectorRectCommand extends BaseCommand {
  type: "querySelectorRect";
  selectors: string[];
}

export type QuerySelectorRectResponse = {
  type: "querySelectorRect";
  id?: number;
  error?: string;
} & (
  | {
      found: true;
      selector: string;
      rect: { left: number; top: number; width: number; height: number };
    }
  | { found: false }
);

export async function handleQuerySelectorRectCommand(
  msg: IncomingCommand,
): Promise<QuerySelectorRectResponse> {
  if (!Array.isArray(msg.selectors) || msg.selectors.length === 0) {
    return {
      type: "querySelectorRect",
      found: false,
      error: "Missing selectors parameter",
    };
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return handleQuerySelectorRect(msg.selectors as string[]);
}

async function handleQuerySelectorRect(
  selectors: string[],
): Promise<QuerySelectorRectResponse> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sels: string[]) => {
      for (const sel of sels) {
        const element = document.querySelector(sel);
        if (element) {
          const domRect = element.getBoundingClientRect();
          return {
            found: true,
            selector: sel,
            rect: {
              left: domRect.left,
              top: domRect.top,
              width: domRect.width,
              height: domRect.height,
            },
          };
        }
      }
      return { found: false };
    },
    args: [selectors],
  });
  const result = results[0]?.result;
  if (isScriptFound(result) && result.found && result.selector) {
    return {
      type: "querySelectorRect",
      found: true,
      selector: result.selector,
      rect: result.rect,
    };
  }
  return {
    type: "querySelectorRect",
    found: false,
    ...(isScriptFound(result) ? {} : { error: "Script execution failed" }),
  };
}
