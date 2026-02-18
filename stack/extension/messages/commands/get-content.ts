import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getScriptTarget } from "../../script-target.js";
import { isScriptContent } from "../../script-results.js";

export const getContentSchema = z.object({
  selector: z.string().optional(),
  html: z.boolean().optional(),
  frameId: z.number().optional(),
});

export type GetContentCommand = z.infer<typeof getContentSchema> & { type: "getContent" };

export type GetContentResponse = BaseResponse & { type: "getContent" } & (
    | { kind: "page"; content: string }
    | { kind: "found"; content: string }
    | { kind: "notFound" }
    | { kind: "error"; error: string }
  );

export async function handleGetContent(
  input: z.infer<typeof getContentSchema>,
): Promise<GetContentResponse> {
  const target = await getScriptTarget(input.frameId);
  const results = await chrome.scripting.executeScript({
    target,
    func: (sel: string | null, wantHtml: boolean) => {
      if (sel) {
        const element = document.querySelector(sel);
        if (!element) return { content: "", found: false };
        return { content: wantHtml ? element.outerHTML : element.textContent || "", found: true };
      }
      return { content: wantHtml ? document.documentElement.outerHTML : document.body.innerText };
    },
    args: [input.selector ?? null, input.html ?? false],
  });
  const result = results[0]?.result;
  if (isScriptContent(result)) {
    if (result.found === true) {
      return { type: "getContent", kind: "found", content: result.content };
    }
    if (result.found === false) {
      return { type: "getContent", kind: "notFound" };
    }
    return { type: "getContent", kind: "page", content: result.content };
  }
  const selectorLabel = input.selector ?? "body";
  return {
    type: "getContent",
    kind: "error",
    error: `Script execution failed for selector: ${selectorLabel}`,
  };
}
