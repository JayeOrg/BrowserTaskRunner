export interface BaseResponse {
  // Set by connection.ts when forwarding to host, not by command handlers
  id?: number;
  error?: string;
}

export interface ErrorResponse extends BaseResponse {
  type: "error";
  error: string;
}
