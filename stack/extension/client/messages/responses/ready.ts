import type { BaseResponse } from "./base.js";

export interface ReadyResponse extends BaseResponse {
  type: "ready";
}
