import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTabId } from "../../tabs.js";
import { extractResult } from "../../script-results.js";

export const getFrameIdSchema = z.object({
  selector: z.string(),
});

export type GetFrameIdCommand = z.infer<typeof getFrameIdSchema> & { type: "getFrameId" };

export type GetFrameIdResponse = BaseResponse & { type: "getFrameId" } & (
    | { found: true; frameId: number }
    | { found: false }
  );

export async function handleGetFrameId(
  input: z.infer<typeof getFrameIdSchema>,
): Promise<GetFrameIdResponse> {
  const tabId = await getActiveTabId();

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string) => {
      const element = document.querySelector(sel);
      if (!element) {
        return { error: `Element not found: ${sel}` };
      }
      if (!(element instanceof HTMLIFrameElement)) {
        return { error: `Element is not an <iframe>: ${sel}` };
      }
      return { src: element.src };
    },
    args: [input.selector],
  });

  const extracted = extractResult(results);
  if (!extracted.ok) {
    return { type: "getFrameId", found: false, error: extracted.error };
  }
  const value = extracted.value;
  if (
    typeof value !== "object" ||
    value === null ||
    !("src" in value) ||
    typeof value.src !== "string"
  ) {
    return {
      type: "getFrameId",
      found: false,
      error: `Script did not return iframe src for selector: ${input.selector}`,
    };
  }

  const iframeSrc = value.src;
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  if (!frames) {
    return { type: "getFrameId", found: false, error: "Could not enumerate frames" };
  }

  function normalizeUrl(url: string): string {
    try {
      return new URL(url).href;
    } catch {
      return url;
    }
  }

  const normalizedSrc = normalizeUrl(iframeSrc);
  const match = frames.find(
    (frame) => normalizeUrl(frame.url) === normalizedSrc && frame.frameId !== 0,
  );
  if (!match) {
    return {
      type: "getFrameId",
      found: false,
      error: `No frame found matching src: ${iframeSrc}`,
    };
  }

  return { type: "getFrameId", found: true, frameId: match.frameId };
}
