import type { ZodType } from "zod";
import type { ReadyResponse } from "./responses/ready.js";
import type { ErrorResponse } from "./responses/base.js";
import type { IncomingCommand } from "./commands/base.js";
import {
  navigateSchema,
  handleNavigate,
  type NavigateCommand,
  type NavigateResponse,
} from "./commands/navigate.js";
import {
  getUrlSchema,
  handleGetUrl,
  type GetUrlCommand,
  type GetUrlResponse,
} from "./commands/get-url.js";
import { fillSchema, handleFill, type FillCommand, type FillResponse } from "./commands/fill.js";
import {
  clickSchema,
  handleClick,
  type ClickCommand,
  type ClickResponse,
} from "./commands/click.js";
import {
  cdpClickSchema,
  handleCdpClick,
  type CdpClickCommand,
  type CdpClickResponse,
} from "./commands/cdp-click.js";
import {
  waitForSelectorSchema,
  handleWaitForSelector,
  type WaitForSelectorCommand,
  type WaitForSelectorResponse,
} from "./commands/wait-for-selector.js";
import {
  getContentSchema,
  handleGetContent,
  type GetContentCommand,
  type GetContentResponse,
} from "./commands/get-content.js";
import {
  querySelectorRectSchema,
  handleQuerySelectorRect,
  type QuerySelectorRectCommand,
  type QuerySelectorRectResponse,
} from "./commands/query-selector-rect.js";
import {
  clickTextSchema,
  handleClickText,
  type ClickTextCommand,
  type ClickTextResponse,
} from "./commands/click-text.js";
import { pingSchema, handlePing, type PingCommand, type PingResponse } from "./commands/ping.js";

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
  | ClickTextCommand
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
  | ClickTextResponse
  | PingResponse;

export type { ResponseMessage };

export type ResponseFor<T extends CommandMessage["type"] | CommandMessage> = Extract<
  ResponseMessage,
  { type: T extends CommandMessage ? T["type"] : T }
>;

type CommandHandler = (message: IncomingCommand) => Promise<ResponseMessage>;

function createHandler<TInput>(
  schema: ZodType<TInput>,
  handler: (input: TInput) => Promise<ResponseMessage>,
): CommandHandler {
  return async (message) => {
    const result = schema.safeParse(message);
    if (!result.success) {
      return {
        type: "error",
        error: `Invalid ${message.type} command: ${result.error.message}`,
      };
    }
    return handler(result.data);
  };
}

function hasKey<T extends Record<string, unknown>>(
  obj: T,
  key: string,
): key is Extract<keyof T, string> {
  return Object.hasOwn(obj, key);
}

/*
 * The `satisfies` constraint ensures every CommandMessage variant has a handler — adding
 * a new command to the union without a handler here is a compile error. Each handler
 * validates its input via zod schema (createHandler), so IncomingCommand can stay loose
 * as a wire format without sacrificing runtime safety.
 */
const commandHandlers = {
  navigate: createHandler(navigateSchema, handleNavigate),
  getUrl: createHandler(getUrlSchema, handleGetUrl),
  fill: createHandler(fillSchema, handleFill),
  click: createHandler(clickSchema, handleClick),
  cdpClick: createHandler(cdpClickSchema, handleCdpClick),
  waitForSelector: createHandler(waitForSelectorSchema, handleWaitForSelector),
  getContent: createHandler(getContentSchema, handleGetContent),
  querySelectorRect: createHandler(querySelectorRectSchema, handleQuerySelectorRect),
  clickText: createHandler(clickTextSchema, handleClickText),
  ping: createHandler(pingSchema, handlePing),
} satisfies Record<CommandMessage["type"], CommandHandler>;

export async function handleCommand(message: IncomingCommand): Promise<ResponseMessage> {
  if (!hasKey(commandHandlers, message.type)) {
    return {
      type: "error",
      error: `Unknown command: ${message.type}`,
    };
  }
  return commandHandlers[message.type](message);
}
