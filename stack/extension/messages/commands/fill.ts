import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab, getTabId } from "../../tabs.js";
import { isScriptError } from "../../script-results.js";

export const fillSchema = z.object({
  selector: z.string(),
  value: z.string(),
});

export type FillCommand = z.infer<typeof fillSchema> & { type: "fill" };

export interface FillResponse extends BaseResponse {
  type: "fill";
}

export async function handleFill(input: z.infer<typeof fillSchema>): Promise<FillResponse> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string, val: string) => {
      const element = document.querySelector(sel);
      if (!element) {
        return { error: `Element not found: ${sel}` };
      }
      if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
        return { error: `Element is not fillable: ${sel}` };
      }
      element.focus();
      element.value = val;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return {};
    },
    args: [input.selector, input.value],
  });
  const result = results[0]?.result;
  if (isScriptError(result)) {
    return { type: "fill", error: result.error };
  }
  if (result === undefined) {
    return { type: "fill", error: "Script did not execute" };
  }
  return { type: "fill" };
}
