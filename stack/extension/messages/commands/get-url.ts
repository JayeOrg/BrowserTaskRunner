import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTabId } from "../../tabs.js";

export const getUrlSchema = z.object({});

export type GetUrlCommand = { type: "getUrl" };

export interface GetUrlResponse extends BaseResponse {
  type: "getUrl";
  url: string;
  title: string;
}

export async function handleGetUrl(): Promise<GetUrlResponse> {
  const tabId = await getActiveTabId();
  const tab = await chrome.tabs.get(tabId);
  return { type: "getUrl", url: tab.url ?? "", title: tab.title ?? "" };
}
