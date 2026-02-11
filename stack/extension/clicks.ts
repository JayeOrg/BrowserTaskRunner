import { sleep } from "./tabs.js";

/**
 * Dispatch mousedown → mouseup → click via chrome.scripting on the element
 * at the given viewport coordinates.
 */
export async function domClickAt(tabId: number, x: number, y: number): Promise<void> {
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
}

/**
 * Click at viewport coordinates using Chrome DevTools Protocol input events.
 * Falls back to synthetic DOM events if CDP attach or dispatch fails.
 */
export async function cdpClickAt(tabId: number, x: number, y: number): Promise<void> {
  const debuggee = { tabId };
  try {
    await chrome.debugger.attach(debuggee, "1.3");
  } catch {
    await domClickAt(tabId, x, y);
    return;
  }
  try {
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
  } catch {
    await domClickAt(tabId, x, y);
  } finally {
    await chrome.debugger.detach(debuggee).catch(() => undefined);
  }
}
