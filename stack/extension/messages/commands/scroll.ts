import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getScriptTarget } from "../../script-target.js";
import { extractResult } from "../../script-results.js";

const scrollIntoViewSchema = z.object({
  mode: z.literal("intoView"),
  selector: z.string(),
  frameId: z.number().optional(),
});

const scrollToSchema = z.object({
  mode: z.literal("to"),
  x: z.number(),
  y: z.number(),
  frameId: z.number().optional(),
});

const scrollBySchema = z.object({
  mode: z.literal("by"),
  x: z.number(),
  y: z.number(),
  frameId: z.number().optional(),
});

export const scrollSchema = z.discriminatedUnion("mode", [
  scrollIntoViewSchema,
  scrollToSchema,
  scrollBySchema,
]);

export type ScrollCommand = z.infer<typeof scrollSchema> & { type: "scroll" };

export interface ScrollResponse extends BaseResponse {
  type: "scroll";
}

export async function handleScroll(input: z.infer<typeof scrollSchema>): Promise<ScrollResponse> {
  const target = await getScriptTarget(input.frameId);

  if (input.mode === "intoView") {
    const { selector } = input;
    const results = await chrome.scripting.executeScript({
      target,
      func: (sel: string) => {
        const element = document.querySelector(sel);
        if (!element) {
          return { error: `Element not found: ${sel}` };
        }
        element.scrollIntoView({ block: "center", behavior: "instant" });
        return {};
      },
      args: [selector],
    });
    const extracted = extractResult(results);
    if (!extracted.ok) {
      return { type: "scroll", error: extracted.error };
    }
    return { type: "scroll" };
  }

  const { x: scrollX, y: scrollY } = input;
  if (input.mode === "to") {
    const results = await chrome.scripting.executeScript({
      target,
      func: (px: number, py: number) => {
        window.scrollTo(px, py);
        return {};
      },
      args: [scrollX, scrollY],
    });
    const extracted = extractResult(results);
    if (!extracted.ok) {
      return { type: "scroll", error: extracted.error };
    }
    return { type: "scroll" };
  }

  // Mode === "by"
  const results = await chrome.scripting.executeScript({
    target,
    func: (px: number, py: number) => {
      window.scrollBy(px, py);
      return {};
    },
    args: [scrollX, scrollY],
  });
  const extracted = extractResult(results);
  if (!extracted.ok) {
    return { type: "scroll", error: extracted.error };
  }
  return { type: "scroll" };
}
