export interface CommandMessage {
  type: string;
  url?: string;
  selector?: string;
  value?: string;
  timeout?: number;
}

export interface ResponseMessage {
  id?: number;
  type?: string;
  error?: string;
  url?: string;
  title?: string;
  found?: boolean;
  content?: string;
  selector?: string;
  iframes?: unknown[];
  cfElements?: unknown[];
  buttons?: unknown[];
  iframeInfo?: unknown[];
  success?: boolean;
  pong?: boolean;
  result?: unknown;
  cdpClick?: boolean;
  cdpError?: string;
}
