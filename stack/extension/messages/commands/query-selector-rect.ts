import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getScriptTarget } from "../../script-target.js";
import { isScriptLocate, type Rect } from "../../script-results.js";

export const querySelectorRectSchema = z.object({
  selectors: z.array(z.string()),
  frameId: z.number().optional(),
});

export type QuerySelectorRectCommand = z.infer<typeof querySelectorRectSchema> & {
  type: "querySelectorRect";
};

export type QuerySelectorRectResponse = BaseResponse & { type: "querySelectorRect" } & (
    | {
        found: true;
        selector: string;
        rect: Rect;
      }
    | { found: false }
  );

export async function handleQuerySelectorRect(
  input: z.infer<typeof querySelectorRectSchema>,
): Promise<QuerySelectorRectResponse> {
  const target = await getScriptTarget(input.frameId);
  const results = await chrome.scripting.executeScript({
    target,
    func: (sels: string[]) => {
      for (const sel of sels) {
        const element = document.querySelector(sel);
        if (element) {
          element.scrollIntoView({ block: "center", behavior: "instant" });
          const domRect = element.getBoundingClientRect();
          return {
            found: true,
            selector: sel,
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
    args: [input.selectors],
  });
  const result = results[0]?.result;
  if (isScriptLocate(result) && result.found && result.selector) {
    return {
      type: "querySelectorRect",
      found: true,
      selector: result.selector,
      rect: result.rect,
    };
  }
  const response: QuerySelectorRectResponse = { type: "querySelectorRect", found: false };
  if (!isScriptLocate(result)) {
    response.error = `Script execution failed for selectors: ${input.selectors.join(", ")}`;
  }
  return response;
}
