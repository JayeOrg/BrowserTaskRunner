import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";
import { getActiveTabId } from "../../tabs.js";
import { cdpClickAt } from "../../clicks.js";

export const cdpClickSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type CdpClickCommand = z.infer<typeof cdpClickSchema> & { type: "cdpClick" };

export interface CdpClickResponse extends BaseResponse {
  type: "cdpClick";
}

export async function handleCdpClick(
  input: z.infer<typeof cdpClickSchema>,
): Promise<CdpClickResponse> {
  const tabId = await getActiveTabId();
  await cdpClickAt(tabId, input.x, input.y);
  return { type: "cdpClick" };
}
