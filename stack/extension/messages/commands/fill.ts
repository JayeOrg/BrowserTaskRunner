import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getScriptTarget } from "../../script-target.js";
import { extractResult } from "../../script-results.js";

export const fillSchema = z.object({
  selector: z.string(),
  value: z.string(),
  frameId: z.number().optional(),
});

export type FillCommand = z.infer<typeof fillSchema> & { type: "fill" };

export interface FillResponse extends BaseResponse {
  type: "fill";
}

export async function handleFill(input: z.infer<typeof fillSchema>): Promise<FillResponse> {
  const target = await getScriptTarget(input.frameId);
  const results = await chrome.scripting.executeScript({
    target,
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
  const extracted = extractResult(results);
  if (!extracted.ok) {
    return { type: "fill", error: extracted.error };
  }
  return { type: "fill" };
}
