import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getScriptTarget } from "../../script-target.js";
import { extractResult } from "../../script-results.js";

export const checkSchema = z.object({
  selector: z.string(),
  checked: z.boolean(),
  frameId: z.number().optional(),
});

export type CheckCommand = z.infer<typeof checkSchema> & { type: "check" };

export interface CheckResponse extends BaseResponse {
  type: "check";
}

export async function handleCheck(input: z.infer<typeof checkSchema>): Promise<CheckResponse> {
  const target = await getScriptTarget(input.frameId);
  const results = await chrome.scripting.executeScript({
    target,
    func: (sel: string, desired: boolean) => {
      const element = document.querySelector(sel);
      if (!element) {
        return { error: `Element not found: ${sel}` };
      }
      if (!(element instanceof HTMLInputElement)) {
        return { error: `Element is not an <input>: ${sel}` };
      }
      if (element.type !== "checkbox" && element.type !== "radio") {
        return { error: `Element is not a checkbox or radio: ${sel} (type=${element.type})` };
      }
      if (element.checked !== desired) {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const eventOptions = {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: centerX,
          clientY: centerY,
          button: 0,
          buttons: 1,
        };
        element.dispatchEvent(new MouseEvent("mousedown", eventOptions));
        element.dispatchEvent(new MouseEvent("mouseup", eventOptions));
        element.dispatchEvent(new MouseEvent("click", eventOptions));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (element.checked !== desired) {
        return {
          error: `Check state verification failed for ${sel}: expected ${String(desired)}, got ${String(element.checked)}`,
        };
      }
      return {};
    },
    args: [input.selector, input.checked],
  });
  const extracted = extractResult(results);
  if (!extracted.ok) {
    return { type: "check", error: extracted.error };
  }
  return { type: "check" };
}
