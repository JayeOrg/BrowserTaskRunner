import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab, getTabId } from "../../tabs.js";
import { isScriptContent } from "../../script-results.js";

export const getContentSchema = z.object({
  selector: z.string().optional(),
  html: z.boolean().optional(),
});

export type GetContentCommand = z.infer<typeof getContentSchema> & { type: "getContent" };

export interface GetContentResponse extends BaseResponse {
  type: "getContent";
  content: string;
}

export async function handleGetContent(
  input: z.infer<typeof getContentSchema>,
): Promise<GetContentResponse> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string | null, wantHtml: boolean) => {
      if (sel) {
        const element = document.querySelector(sel);
        if (!element) return { content: "" };
        return { content: wantHtml ? element.outerHTML : element.textContent || "" };
      }
      return { content: wantHtml ? document.documentElement.outerHTML : document.body.innerText };
    },
    args: [input.selector ?? null, input.html ?? false],
  });
  const result = results[0]?.result;
  if (isScriptContent(result)) {
    return { type: "getContent", content: result.content };
  }
  return { type: "getContent", content: "", error: "Script execution failed" };
}
