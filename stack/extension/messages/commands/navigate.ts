import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTabId, waitForTabLoad } from "../../tabs.js";

export const navigateSchema = z.object({
  url: z.string(),
});

export type NavigateCommand = z.infer<typeof navigateSchema> & { type: "navigate" };

export interface NavigateResponse extends BaseResponse {
  type: "navigate";
  url: string;
  title: string;
}

export async function handleNavigate(
  input: z.infer<typeof navigateSchema>,
): Promise<NavigateResponse> {
  const tabId = await getActiveTabId();
  const loadPromise = waitForTabLoad(tabId);
  await chrome.tabs.update(tabId, { url: input.url });
  const loadResult = await loadPromise;
  const updatedTab = await chrome.tabs.get(tabId);
  if (loadResult.timedOut) {
    return {
      type: "navigate",
      url: updatedTab.url ?? input.url,
      title: updatedTab.title ?? "",
      error: "Navigation timed out waiting for page load",
    };
  }
  return {
    type: "navigate",
    url: updatedTab.url ?? input.url,
    title: updatedTab.title ?? "",
  };
}
