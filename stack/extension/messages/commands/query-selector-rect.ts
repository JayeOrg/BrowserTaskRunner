import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab, getTabId } from "../../tabs.js";
import { isScriptFound } from "../../script-results.js";

export const querySelectorRectSchema = z.object({
  selectors: z.array(z.string()),
});

export type QuerySelectorRectCommand = z.infer<typeof querySelectorRectSchema> & {
  type: "querySelectorRect";
};

export type QuerySelectorRectResponse = BaseResponse & { type: "querySelectorRect" } & (
    | {
        found: true;
        selector: string;
        rect: { left: number; top: number; width: number; height: number };
      }
    | { found: false }
  );

export async function handleQuerySelectorRect(
  input: z.infer<typeof querySelectorRectSchema>,
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
    args: [input.selectors],
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
