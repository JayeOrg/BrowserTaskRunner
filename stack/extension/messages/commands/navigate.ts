import type { BaseCommand, IncomingCommand } from "./base.js";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab, getTabId, waitForTabLoad } from "../../tabs.js";

export interface NavigateCommand extends BaseCommand {
  type: "navigate";
  url: string;
}

export interface NavigateResponse extends BaseResponse {
  type: "navigate";
  url: string;
  title: string;
}

export async function handleNavigateCommand(msg: IncomingCommand): Promise<NavigateResponse> {
  if (typeof msg.url !== "string") {
    return {
      type: "navigate",
      url: "",
      title: "",
      error: "Missing url parameter",
    };
  }
  return handleNavigate(msg.url);
}

async function handleNavigate(url: string): Promise<NavigateResponse> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  await chrome.tabs.update(tabId, { url });
  await waitForTabLoad(tabId);
  const updatedTab = await chrome.tabs.get(tabId);
  return {
    type: "navigate",
    url: updatedTab.url ?? url,
    title: updatedTab.title ?? "",
  };
}
