import { getActiveTabId } from "./tabs.js";

export async function getScriptTarget(
  frameId?: number,
): Promise<{ tabId: number; frameIds?: number[] }> {
  const tabId = await getActiveTabId();
  if (frameId !== undefined) {
    return { tabId, frameIds: [frameId] };
  }
  return { tabId };
}
