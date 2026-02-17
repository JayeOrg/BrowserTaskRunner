import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getScriptTarget } from "../../script-target.js";
import { extractResult } from "../../script-results.js";
import { domClickAt } from "../../clicks.js";

export const clickSchema = z.object({
  selector: z.string(),
  frameId: z.number().optional(),
});

export type ClickCommand = z.infer<typeof clickSchema> & { type: "click" };

export interface ClickResponse extends BaseResponse {
  type: "click";
}

const RectResultSchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});

export async function handleClick(input: z.infer<typeof clickSchema>): Promise<ClickResponse> {
  const target = await getScriptTarget(input.frameId);
  const results = await chrome.scripting.executeScript({
    target,
    func: (sel: string) => {
      const element = document.querySelector(sel);
      if (!element) {
        return { error: `Element not found: ${sel}` };
      }
      element.scrollIntoView({ block: "center", behavior: "instant" });
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    },
    args: [input.selector],
  });
  const extracted = extractResult(results);
  if (!extracted.ok) {
    return { type: "click", error: extracted.error };
  }
  const parsed = RectResultSchema.safeParse(extracted.value);
  if (!parsed.success) {
    return { type: "click", error: "Unexpected script result" };
  }
  const clickX = parsed.data.left + parsed.data.width / 2;
  const clickY = parsed.data.top + parsed.data.height / 2;
  await domClickAt(target.tabId, clickX, clickY);
  return { type: "click" };
}
