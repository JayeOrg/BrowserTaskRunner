import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";

export const pingSchema = z.object({});

export type PingCommand = { type: "ping" };

export interface PingResponse extends BaseResponse {
  type: "ping";
  pong: true;
}

export async function handlePing(): Promise<PingResponse> {
  return { type: "ping", pong: true };
}
