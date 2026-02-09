import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab, getTabId, sleep } from "../../tabs.js";

export const cdpClickSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type CdpClickCommand = z.infer<typeof cdpClickSchema> & { type: "cdpClick" };

export interface CdpClickResponse extends BaseResponse {
  type: "cdpClick";
}

async function syntheticClick(tabId: number, x: number, y: number): Promise<CdpClickResponse> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (posX: number, posY: number) => {
      const targetEl = document.elementFromPoint(posX, posY);
      if (targetEl) {
        const eventInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: posX,
          clientY: posY,
          button: 0,
          buttons: 1,
        };
        targetEl.dispatchEvent(new MouseEvent("mousedown", eventInit));
        targetEl.dispatchEvent(new MouseEvent("mouseup", eventInit));
        targetEl.dispatchEvent(new MouseEvent("click", eventInit));
      }
    },
    args: [x, y],
  });
  return { type: "cdpClick" };
}

export async function handleCdpClick(
  input: z.infer<typeof cdpClickSchema>,
): Promise<CdpClickResponse> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const debuggee = { tabId };

  try {
    await chrome.debugger.attach(debuggee, "1.3");
  } catch {
    // Attach failed (e.g., debugger already attached) — use synthetic events
    return syntheticClick(tabId, input.x, input.y);
  }

  try {
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: input.x,
      y: input.y,
      button: "left",
      clickCount: 1,
    });

    await sleep(50);

    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: input.x,
      y: input.y,
      button: "left",
      clickCount: 1,
    });

    return { type: "cdpClick" };
  } catch {
    // CDP commands failed after attach — fall back to synthetic events
    return await syntheticClick(tabId, input.x, input.y);
  } finally {
    // Detach may fail if tab was closed; safe to ignore
    await chrome.debugger.detach(debuggee).catch(() => undefined);
  }
}
