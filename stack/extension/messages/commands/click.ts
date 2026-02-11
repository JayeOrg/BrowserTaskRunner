import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getScriptTarget } from "../../script-target.js";
import { extractResult } from "../../script-results.js";

export const clickSchema = z.object({
  selector: z.string(),
  frameId: z.number().optional(),
});

export type ClickCommand = z.infer<typeof clickSchema> & { type: "click" };

export interface ClickResponse extends BaseResponse {
  type: "click";
}

export async function handleClick(input: z.infer<typeof clickSchema>): Promise<ClickResponse> {
  const target = await getScriptTarget(input.frameId);
  const results = await chrome.scripting.executeScript({
    target,
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
  const extracted = extractResult(results);
  if (!extracted.ok) {
    return { type: "click", error: extracted.error };
  }
  return { type: "click" };
}
