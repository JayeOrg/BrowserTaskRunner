import type { ReadyResponse } from "./responses/ready.js";
import type { ErrorResponse } from "./responses/base.js";
import type { IncomingCommand } from "./commands/base.js";
import {
  type NavigateCommand,
  type NavigateResponse,
  handleNavigateCommand,
} from "./commands/navigate.js";
import {
  type GetUrlCommand,
  type GetUrlResponse,
  handleGetUrlCommand,
} from "./commands/get-url.js";
import {
  type FillCommand,
  type FillResponse,
  handleFillCommand,
} from "./commands/fill.js";
import {
  type ClickCommand,
  type ClickResponse,
  handleClickCommand,
} from "./commands/click.js";
import {
  type CdpClickCommand,
  type CdpClickResponse,
  handleCdpClickCommand,
} from "./commands/cdp-click.js";
import {
  type WaitForSelectorCommand,
  type WaitForSelectorResponse,
  handleWaitForSelectorCommand,
} from "./commands/wait-for-selector.js";
import {
  type GetContentCommand,
  type GetContentResponse,
  handleGetContentCommand,
} from "./commands/get-content.js";
import {
  type QuerySelectorRectCommand,
  type QuerySelectorRectResponse,
  handleQuerySelectorRectCommand,
} from "./commands/query-selector-rect.js";
import {
  type PingCommand,
  type PingResponse,
  handlePingCommand,
} from "./commands/ping.js";

export { isIncomingCommand } from "./commands/base.js";
export type { IncomingCommand } from "./commands/base.js";

export type CommandMessage =
  | NavigateCommand
  | GetUrlCommand
  | FillCommand
  | ClickCommand
  | CdpClickCommand
  | WaitForSelectorCommand
  | GetContentCommand
  | QuerySelectorRectCommand
  | PingCommand;

type ResponseMessage =
  | ReadyResponse
  | ErrorResponse
  | NavigateResponse
  | GetUrlResponse
  | FillResponse
  | ClickResponse
  | CdpClickResponse
  | WaitForSelectorResponse
  | GetContentResponse
  | QuerySelectorRectResponse
  | PingResponse;

export type { ResponseMessage };

export type ResponseFor<T extends CommandMessage> = Extract<
  ResponseMessage,
  { type: T["type"] }
>;

type CommandHandler = (message: IncomingCommand) => Promise<ResponseMessage>;

const commandHandlers: Record<string, CommandHandler> = {
  navigate: handleNavigateCommand,
  getUrl: handleGetUrlCommand,
  fill: handleFillCommand,
  click: handleClickCommand,
  cdpClick: handleCdpClickCommand,
  waitForSelector: handleWaitForSelectorCommand,
  getContent: handleGetContentCommand,
  querySelectorRect: handleQuerySelectorRectCommand,
  ping: handlePingCommand,
};

export async function handleCommand(
  message: IncomingCommand,
): Promise<ResponseMessage> {
  const handler = commandHandlers[message.type];
  if (!handler) {
    return {
      type: "error",
      error: `Unknown command: ${message.type}`,
    };
  }
  return handler(message);
}
