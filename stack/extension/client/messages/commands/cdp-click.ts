import type { BaseCommand, IncomingCommand } from "./base.js";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab, getTabId, sleep } from "../../tabs.js";

export interface CdpClickCommand extends BaseCommand {
  type: "cdpClick";
  x: number;
  y: number;
}

export interface CdpClickResponse extends BaseResponse {
  type: "cdpClick";
  success: boolean;
}

export async function handleCdpClickCommand(
  msg: IncomingCommand,
): Promise<CdpClickResponse> {
  if (typeof msg.x !== "number" || typeof msg.y !== "number") {
    return {
      type: "cdpClick",
      success: false,
      error: "Missing x or y parameter",
    };
  }
  return handleCdpClick(msg.x, msg.y);
}

async function handleCdpClick(x: number, y: number): Promise<CdpClickResponse> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);

  try {
    const debuggee = { tabId };
    await chrome.debugger.attach(debuggee, "1.3");

    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });

    await sleep(50);

    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });

    await chrome.debugger.detach(debuggee);
    return { type: "cdpClick", success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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
    return {
      type: "cdpClick",
      success: true,
      error: `CDP failed, used fallback: ${message}`,
    };
  }
}
