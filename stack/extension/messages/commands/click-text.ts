import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTab, getTabId, sleep } from "../../tabs.js";
import { isScriptFound } from "../../script-results.js";

export const clickTextSchema = z.object({
  texts: z.array(z.string()),
  tag: z.string().optional(),
  exact: z.boolean().optional(),
  cdp: z.boolean().optional(),
});

export type ClickTextCommand = z.infer<typeof clickTextSchema> & { type: "clickText" };

export type ClickTextResponse = BaseResponse & { type: "clickText" } & (
    | {
        found: true;
        text: string;
        rect: { left: number; top: number; width: number; height: number };
      }
    | { found: false }
  );

async function syntheticClickAt(tabId: number, posX: number, posY: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (cx: number, cy: number) => {
      const targetEl = document.elementFromPoint(cx, cy);
      if (targetEl) {
        const eventInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: cx,
          clientY: cy,
          button: 0,
          buttons: 1,
        };
        targetEl.dispatchEvent(new MouseEvent("mousedown", eventInit));
        targetEl.dispatchEvent(new MouseEvent("mouseup", eventInit));
        targetEl.dispatchEvent(new MouseEvent("click", eventInit));
      }
    },
    args: [posX, posY],
  });
}

async function cdpClickAt(tabId: number, posX: number, posY: number): Promise<void> {
  const debuggee = { tabId };
  try {
    await chrome.debugger.attach(debuggee, "1.3");
  } catch {
    await syntheticClickAt(tabId, posX, posY);
    return;
  }
  try {
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: posX,
      y: posY,
      button: "left",
      clickCount: 1,
    });
    await sleep(50);
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: posX,
      y: posY,
      button: "left",
      clickCount: 1,
    });
  } catch {
    await syntheticClickAt(tabId, posX, posY);
  } finally {
    await chrome.debugger.detach(debuggee).catch(() => undefined);
  }
}

export async function handleClickText(
  input: z.infer<typeof clickTextSchema>,
): Promise<ClickTextResponse> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);

  // Find element by text content using XPath (supports case-insensitive matching)
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (texts: string[], tag: string | null, useExact: boolean) => {
      const tagName = tag ?? "*";
      const translate =
        "translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')";
      for (const text of texts) {
        const lower = text.toLowerCase();
        const condition = useExact
          ? `${translate} = '${lower}'`
          : `contains(${translate}, '${lower}')`;
        const xpath = `//${tagName}[${condition}]`;
        const match = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        const node = match.singleNodeValue;
        if (node instanceof Element) {
          node.scrollIntoView({ block: "center", behavior: "instant" });
          const domRect = node.getBoundingClientRect();
          return {
            found: true,
            selector: text,
            rect: {
              left: domRect.left,
              top: domRect.top,
              width: domRect.width,
              height: domRect.height,
            },
          };
        }
      }
      return { found: false };
    },
    args: [input.texts, input.tag ?? null, input.exact ?? false],
  });

  const result = results[0]?.result;
  if (!isScriptFound(result) || !result.found || !result.rect || !result.selector) {
    return { type: "clickText", found: false };
  }

  const clickX = result.rect.left + result.rect.width / 2;
  const clickY = result.rect.top + result.rect.height / 2;

  if (input.cdp) {
    await cdpClickAt(tabId, clickX, clickY);
  } else {
    await syntheticClickAt(tabId, clickX, clickY);
  }

  return {
    type: "clickText",
    found: true,
    text: result.selector,
    rect: result.rect,
  };
}
