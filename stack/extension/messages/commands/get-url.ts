import type { BaseCommand } from "./base.js";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab } from "../../tabs.js";

export interface GetUrlCommand extends BaseCommand {
  type: "getUrl";
}

export interface GetUrlResponse extends BaseResponse {
  type: "getUrl";
  url: string;
  title: string;
}

export async function handleGetUrlCommand(): Promise<GetUrlResponse> {
  const tab = await getActiveTab();
  return { type: "getUrl", url: tab.url ?? "", title: tab.title ?? "" };
}
