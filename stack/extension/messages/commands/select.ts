import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getScriptTarget } from "../../script-target.js";
import { extractResult } from "../../script-results.js";

export const selectSchema = z.object({
  selector: z.string(),
  values: z.array(z.string()),
  frameId: z.number().optional(),
});

export type SelectCommand = z.infer<typeof selectSchema> & { type: "selectOption" };

export interface SelectResponse extends BaseResponse {
  type: "selectOption";
  selected: string[];
}

export async function handleSelect(input: z.infer<typeof selectSchema>): Promise<SelectResponse> {
  const target = await getScriptTarget(input.frameId);
  const results = await chrome.scripting.executeScript({
    target,
    func: (sel: string, vals: string[]) => {
      const element = document.querySelector(sel);
      if (!element) {
        return { error: `Element not found: ${sel}` };
      }
      if (!(element instanceof HTMLSelectElement)) {
        return { error: `Element is not a <select>: ${sel}` };
      }
      const valueSet = new Set(vals);
      for (let idx = 0; idx < element.options.length; idx++) {
        const opt = element.options[idx];
        if (opt) opt.selected = valueSet.has(opt.value);
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      const selected: string[] = [];
      for (let idx = 0; idx < element.selectedOptions.length; idx++) {
        const opt = element.selectedOptions[idx];
        if (opt) selected.push(opt.value);
      }
      return { selected };
    },
    args: [input.selector, input.values],
  });
  const extracted = extractResult(results);
  if (!extracted.ok) {
    return { type: "selectOption", error: extracted.error, selected: [] };
  }
  const parsed = z.object({ selected: z.array(z.string()) }).safeParse(extracted.value);
  if (parsed.success) {
    return { type: "selectOption", selected: parsed.data.selected };
  }
  return { type: "selectOption", error: "Script did not return selected values", selected: [] };
}
