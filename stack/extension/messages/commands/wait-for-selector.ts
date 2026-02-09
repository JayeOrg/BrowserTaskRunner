import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab, getTabId } from "../../tabs.js";
import { isScriptFound } from "../../script-results.js";

export const waitForSelectorSchema = z.object({
  selector: z.string(),
  timeout: z.number().optional(),
});

export type WaitForSelectorCommand = z.infer<typeof waitForSelectorSchema> & {
  type: "waitForSelector";
};

const DEFAULT_TIMEOUT_MS = 10000;

export type WaitForSelectorResponse = BaseResponse & { type: "waitForSelector" } & (
    | { found: true; selector: string }
    | { found: false; timedOut?: boolean }
  );

export async function handleWaitForSelector(
  input: z.infer<typeof waitForSelectorSchema>,
): Promise<WaitForSelectorResponse> {
  const timeout = input.timeout ?? DEFAULT_TIMEOUT_MS;
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (sel: string, timeoutMs: number) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const element = document.querySelector(sel);
        if (element) {
          return { found: true };
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });
      }
      return { found: false, timedOut: true };
    },
    args: [input.selector, timeout],
  });
  const result = results[0]?.result;
  if (isScriptFound(result)) {
    if (result.found) {
      return { type: "waitForSelector", found: true, selector: input.selector };
    }
    return {
      type: "waitForSelector",
      found: false,
      ...(result.timedOut ? { timedOut: true } : {}),
    };
  }
  return {
    type: "waitForSelector",
    found: false,
    error: "Script execution failed",
  };
}
