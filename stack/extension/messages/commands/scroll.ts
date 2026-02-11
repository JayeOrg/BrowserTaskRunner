import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getScriptTarget } from "../../script-target.js";
import { extractResult } from "../../script-results.js";

export const scrollSchema = z.object({
  mode: z.enum(["intoView", "to", "by"]),
  selector: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  frameId: z.number().optional(),
});

export type ScrollCommand = z.infer<typeof scrollSchema> & { type: "scroll" };

export interface ScrollResponse extends BaseResponse {
  type: "scroll";
}

export async function handleScroll(input: z.infer<typeof scrollSchema>): Promise<ScrollResponse> {
  const target = await getScriptTarget(input.frameId);
  const results = await chrome.scripting.executeScript({
    target,
    func: (mode: string, sel: string | null, x: number, y: number) => {
      if (mode === "intoView") {
        if (!sel) {
          return { error: "scrollIntoView requires a selector" };
        }
        const element = document.querySelector(sel);
        if (!element) {
          return { error: `Element not found: ${sel}` };
        }
        element.scrollIntoView({ block: "center", behavior: "instant" });
        return {};
      }
      if (mode === "to") {
        window.scrollTo(x, y);
        return {};
      }
      if (mode === "by") {
        window.scrollBy(x, y);
        return {};
      }
      return { error: `Unknown scroll mode: ${mode}` };
    },
    args: [input.mode, input.selector ?? null, input.x ?? 0, input.y ?? 0],
  });
  const extracted = extractResult(results);
  if (!extracted.ok) {
    return { type: "scroll", error: extracted.error };
  }
  return { type: "scroll" };
}
