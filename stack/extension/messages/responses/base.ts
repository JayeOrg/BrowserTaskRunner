export interface BaseResponse {
  id?: number;
  error?: string;
}

export interface ErrorResponse extends BaseResponse {
  type: "error";
  error: string;
}
