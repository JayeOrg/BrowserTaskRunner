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

export interface GetContentResponse extends BaseResponse {
  type: "getContent";
  content: string;
  found?: boolean;
}

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
    const response: GetContentResponse = { type: "getContent", content: result.content };
    if (result.found !== undefined) response.found = result.found;
    return response;
  }
  const selectorLabel = input.selector ?? "body";
  return {
    type: "getContent",
    content: "",
    error: `Script execution failed for selector: ${selectorLabel}`,
  };
}
