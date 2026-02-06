export interface BaseResponse {
  id?: number;
  error?: string;
}

// Returned for unknown or invalid commands
export interface ErrorResponse extends BaseResponse {
  type: "error";
  error: string;
}
