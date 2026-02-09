import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab } from "../../tabs.js";

export const getUrlSchema = z.object({});

export type GetUrlCommand = { type: "getUrl" };

export interface GetUrlResponse extends BaseResponse {
  type: "getUrl";
  url: string;
  title: string;
}

export async function handleGetUrl(): Promise<GetUrlResponse> {
  const tab = await getActiveTab();
  return { type: "getUrl", url: tab.url ?? "", title: tab.title ?? "" };
}
