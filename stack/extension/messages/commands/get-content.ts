import type { BaseCommand, IncomingCommand } from "./base.js";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab, getTabId } from "../../tabs.js";
import { isScriptContent } from "../../script-results.js";

export interface GetContentCommand extends BaseCommand {
  type: "getContent";
  selector?: string;
}

export interface GetContentResponse extends BaseResponse {
  type: "getContent";
  content: string;
}

export async function handleGetContentCommand(msg: IncomingCommand): Promise<GetContentResponse> {
  const selector = typeof msg.selector === "string" ? msg.selector : undefined;
  return handleGetContent(selector);
}

async function handleGetContent(selector?: string): Promise<GetContentResponse> {
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
    args: [selector],
  });
  const result = results[0]?.result;
  if (isScriptContent(result)) {
    return { type: "getContent", content: result.content };
  }
  return { type: "getContent", content: "", error: "Script execution failed" };
}
