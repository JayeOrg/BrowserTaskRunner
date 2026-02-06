import type { BaseCommand } from "./base.js";
import type { BaseResponse } from "../responses/base.js";

export interface PingCommand extends BaseCommand {
  type: "ping";
}

export interface PingResponse extends BaseResponse {
  type: "ping";
  pong: true;
}

export async function handlePingCommand(): Promise<PingResponse> {
  return { type: "ping", pong: true };
}
