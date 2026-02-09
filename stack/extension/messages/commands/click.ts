import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab, getTabId } from "../../tabs.js";
import { isScriptError } from "../../script-results.js";

export const clickSchema = z.object({
  selector: z.string(),
});

export type ClickCommand = z.infer<typeof clickSchema> & { type: "click" };

export interface ClickResponse extends BaseResponse {
  type: "click";
}

export async function handleClick(input: z.infer<typeof clickSchema>): Promise<ClickResponse> {
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

      return {};
    },
    args: [input.selector],
  });
  const result = results[0]?.result;
  if (isScriptError(result)) {
    return { type: "click", error: result.error };
  }
  if (result === undefined) {
    return { type: "click", error: "Script did not execute" };
  }
  return { type: "click" };
}
