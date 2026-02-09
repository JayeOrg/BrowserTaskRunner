import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab, getTabId } from "../../tabs.js";
import { isScriptContent } from "../../script-results.js";

export const getContentSchema = z.object({
  selector: z.string().optional(),
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
    func: (sel?: string) => {
      if (sel) {
        const element = document.querySelector(sel);
        return { content: element?.textContent ?? "" };
      }
      return { content: document.body.innerText };
    },
    args: [input.selector],
  });
  const result = results[0]?.result;
  if (isScriptContent(result)) {
    return { type: "getContent", content: result.content };
  }
  return { type: "getContent", content: "", error: "Script execution failed" };
}
