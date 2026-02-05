// Command types sent from host to extension
export type CommandType =
  | 'navigate'
  | 'getUrl'
  | 'fill'
  | 'click'
  | 'cdpClick'
  | 'waitForSelector'
  | 'getContent'
  | 'querySelectorRect'
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

export interface CdpClickCommand extends BaseCommand {
  type: 'cdpClick';
  x: number;
  y: number;
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

export interface QuerySelectorRectCommand extends BaseCommand {
  type: 'querySelectorRect';
  selectors: string[];
}

export interface SimpleCommand extends BaseCommand {
  type: 'getUrl' | 'ping';
}

export type CommandMessage =
  | NavigateCommand
  | FillCommand
  | ClickCommand
  | CdpClickCommand
  | WaitForSelectorCommand
  | GetContentCommand
  | QuerySelectorRectCommand
  | SimpleCommand;

// Response types sent from extension to host
// Generic response - behaviour interprets the result field as needed
export interface ResponseMessage {
  id?: number;
  type?: string;
  error?: string;
  success?: boolean;
  // Navigation/URL responses
  url?: string;
  title?: string;
  loaded?: boolean;
  timedOut?: boolean;
  // Selector responses
  found?: boolean;
  content?: string;
  selector?: string;
  // Element rect response (for querySelectorRect)
  rect?: { left: number; top: number; width: number; height: number };
  // Ping response
  pong?: boolean;
}
