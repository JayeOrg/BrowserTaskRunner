// Command types sent from host to extension
export type CommandType =
  | 'navigate'
  | 'getUrl'
  | 'fill'
  | 'click'
  | 'clickTurnstile'
  | 'debugPage'
  | 'waitForSelector'
  | 'getContent'
  | 'ping';

export interface BaseCommand {
  id?: number;
  type: CommandType;
}

export interface NavigateCommand extends BaseCommand {
  type: 'navigate';
  url: string;
}

export interface FillCommand extends BaseCommand {
  type: 'fill';
  selector: string;
  value: string;
}

export interface ClickCommand extends BaseCommand {
  type: 'click';
  selector: string;
}

export interface WaitForSelectorCommand extends BaseCommand {
  type: 'waitForSelector';
  selector: string;
  timeout?: number;
}

export interface GetContentCommand extends BaseCommand {
  type: 'getContent';
  selector?: string;
}

export interface SimpleCommand extends BaseCommand {
  type: 'getUrl' | 'clickTurnstile' | 'debugPage' | 'ping';
}

export type CommandMessage =
  | NavigateCommand
  | FillCommand
  | ClickCommand
  | WaitForSelectorCommand
  | GetContentCommand
  | SimpleCommand;

// Response types sent from extension to host
export interface ResponseMessage {
  id?: number;
  type?: string;
  error?: string;
  success?: boolean;
  // Navigation/URL responses
  url?: string;
  title?: string;
  // Selector responses
  found?: boolean;
  selector?: string;
  content?: string;
  // Debug responses
  iframes?: IframeInfo[];
  cfElements?: ElementInfo[];
  buttons?: ButtonInfo[];
  iframeInfo?: IframeInfo[];
  // Turnstile responses
  clickX?: number;
  clickY?: number;
  containerRect?: DOMRect;
  cdpClick?: boolean;
  cdpError?: string;
  // Ping response
  pong?: boolean;
  // Generic result
  result?: unknown;
}

export interface IframeInfo {
  src: string;
  id: string;
  className: string;
  width?: number;
  height?: number;
  rect?: DOMRect;
}

export interface ElementInfo {
  tag: string;
  id: string;
  className: string;
}

export interface ButtonInfo {
  text: string | undefined;
  type: string;
  className: string;
  disabled: boolean;
}

export interface DOMRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
