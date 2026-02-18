import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTabId } from "../../tabs.js";
import { isScriptLocateWithText, isScriptError } from "../../script-results.js";
import { domClickAt, cdpClickAt } from "../../clicks.js";

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

export async function handleClickText(
  input: z.infer<typeof clickTextSchema>,
): Promise<ClickTextResponse> {
  const tabId = await getActiveTabId();

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (texts: string[], tag: string | null, useExact: boolean) => {
      const tagName = tag ?? "*";
      const translate =
        "translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')";

      function xpathString(str: string): string {
        if (!str.includes("'")) return `'${str}'`;
        if (!str.includes('"')) return `"${str}"`;
        const parts = str.split("'");
        return `concat('${parts.join("',\"'\",'")}')`;
      }

      for (const text of texts) {
        const lower = xpathString(text.toLowerCase());
        const condition = useExact ? `${translate} = ${lower}` : `contains(${translate}, ${lower})`;
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
            matchedText: text,
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
  if (isScriptError(result)) {
    return { type: "clickText", found: false, error: result.error };
  }
  if (result === undefined) {
    return { type: "clickText", found: false, error: "Content script did not execute" };
  }
  if (!isScriptLocateWithText(result)) {
    return { type: "clickText", found: false };
  }

  const clickX = result.rect.left + result.rect.width / 2;
  const clickY = result.rect.top + result.rect.height / 2;

  if (input.cdp) {
    await cdpClickAt(tabId, clickX, clickY);
  } else {
    await domClickAt(tabId, clickX, clickY);
  }

  return {
    type: "clickText",
    found: true,
    text: result.matchedText,
    rect: result.rect,
  };
}
