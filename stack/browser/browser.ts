import { WebSocketServer, WebSocket } from "ws";
import { setTimeout as delay } from "node:timers/promises";
import type { CommandMessage, ResponseMessage, ResponseFor } from "../extension/messages/index.js";
import { createPrefixLogger, type PrefixLogger } from "../framework/logging.js";
import { logConnectionInstructions } from "./instructions.js";
import type { StepUpdate, StepRunnerDeps } from "../framework/step-runner.js";

export type IframeOption = { frameId?: number };

type ClickTextOptions = { tag?: string; exact?: boolean; cdp?: boolean; timeout?: number };

type CdpClickSelectorResult = { found: true; selector: string } | { found: false };

type WaitForTextResult = { found: true; text: string } | { found: false };

type WaitForUrlResult = { found: true; url: string } | { found: false };

export interface BrowserOptions {
  commandTimeoutMs?: number;
  connectionTimeoutMs?: number;
  pauseOnError?: boolean;
}

interface BrowserNavigation {
  navigate(url: string): Promise<ResponseFor<"navigate">>;
  getUrl(): Promise<ResponseFor<"getUrl">>;
}

interface BrowserWaiting {
  waitForSelector(
    selector: string,
    timeout?: number,
    options?: IframeOption,
  ): Promise<ResponseFor<"waitForSelector">>;
  waitForText(texts: string[], timeout?: number): Promise<WaitForTextResult>;
  waitForUrl(pattern: string, timeout?: number): Promise<WaitForUrlResult>;
}

interface BrowserClicking {
  click(selector: string, options?: IframeOption): Promise<ResponseFor<"click">>;
  cdpClick(x: number, y: number): Promise<ResponseFor<"cdpClick">>;
  clickText(texts: string[], options?: ClickTextOptions): Promise<ResponseFor<"clickText">>;
  cdpClickSelector(selectors: string[]): Promise<CdpClickSelectorResult>;
}

interface BrowserFormInput {
  fill(selector: string, value: string, options?: IframeOption): Promise<ResponseFor<"fill">>;
  type(selector: string, text: string): Promise<ResponseFor<"keyboard">>;
  selectOption(
    selector: string,
    values: string[],
    options?: IframeOption,
  ): Promise<ResponseFor<"select">>;
  check(selector: string, options?: IframeOption): Promise<ResponseFor<"check">>;
  uncheck(selector: string, options?: IframeOption): Promise<ResponseFor<"check">>;
}

interface BrowserKeyboard {
  press(key: string): Promise<ResponseFor<"keyboard">>;
  keyDown(key: string): Promise<ResponseFor<"keyboard">>;
  keyUp(key: string): Promise<ResponseFor<"keyboard">>;
}

interface BrowserQueries {
  getContent(
    selector?: string,
    options?: { html?: boolean } & IframeOption,
  ): Promise<ResponseFor<"getContent">>;
  getText(selector?: string): Promise<string>;
  querySelectorRect(selectors: string[]): Promise<ResponseFor<"querySelectorRect">>;
  getFrameId(selector: string): Promise<number>;
}

interface BrowserScrolling {
  scrollIntoView(selector: string, options?: IframeOption): Promise<ResponseFor<"scroll">>;
  scrollTo(x: number, y: number): Promise<ResponseFor<"scroll">>;
  scrollBy(x: number, y: number): Promise<ResponseFor<"scroll">>;
}

export interface BrowserAPI
  extends
    BrowserNavigation,
    BrowserWaiting,
    BrowserClicking,
    BrowserFormInput,
    BrowserKeyboard,
    BrowserQueries,
    BrowserScrolling {
  ping(): Promise<ResponseFor<"ping">>;
}

function isResponseMessage(value: unknown): value is ResponseMessage {
  return (
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
  );
}

function isStepControlMessage(value: unknown): value is { type: "stepControl"; action: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "stepControl" &&
    "action" in value &&
    typeof value.action === "string"
  );
}

interface PendingCommand {
  resolve: (value: ResponseMessage) => void;
  reject: (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class Browser implements BrowserAPI {
  private readonly port: number;
  private readonly commandTimeoutMs: number;
  private readonly connectionTimeoutMs: number;
  private readonly pauseOnError: boolean | undefined;
  private readonly logger: PrefixLogger;
  private ws: WebSocket | null = null;
  private server: WebSocketServer | null = null;
  private pendingCommands: Map<number, PendingCommand> = new Map();
  private commandId = 0;
  private controlHandler: ((action: string) => void) | null = null;

  constructor(port: number, options: BrowserOptions = {}) {
    this.port = port;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 30000;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 60000;
    this.pauseOnError = options.pauseOnError;
    this.logger = createPrefixLogger(`Browser:${port.toString()}`);
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = new WebSocketServer({ port: this.port });
    this.server.on("listening", () => {
      logConnectionInstructions(this.logger, this.port);
    });

    await this.waitForConnection();
  }

  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.server?.close();
        this.server = null;
        const seconds = (this.connectionTimeoutMs / 1000).toString();
        reject(new Error(`Extension did not connect within ${seconds} seconds`));
      }, this.connectionTimeoutMs);

      const onServerError = (error: Error) => {
        clearTimeout(timeout);
        this.server?.close();
        this.server = null;
        reject(error);
      };

      this.server?.on("error", onServerError);

      this.server?.on("connection", (incoming: WebSocket) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.logger.log("Rejecting duplicate connection — extension already connected");
          incoming.close(1008, "Already connected");
          return;
        }
        this.ws = incoming;
        incoming.on("close", () => {
          this.ws = null;
          this.rejectAllPending(new Error("Extension disconnected"));
        });
        incoming.on("message", (data: Buffer) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data.toString());
          } catch (error) {
            this.logger.log("Error parsing message", { error: String(error) });
            return;
          }

          if (isStepControlMessage(parsed)) {
            if (this.controlHandler) {
              this.controlHandler(parsed.action);
            }
            return;
          }

          if (!isResponseMessage(parsed)) {
            this.logger.log("Invalid message format");
            return;
          }

          if (parsed.type === "ready") {
            clearTimeout(timeout);
            this.server?.removeListener("error", onServerError);
            resolve();
            return;
          }

          this.handleResponse(parsed);
        });
      });
    });
  }

  private handleResponse(message: ResponseMessage): void {
    if (message.id === undefined) {
      this.logger.log("Unroutable response (no id)", { type: message.type });
      return;
    }

    const pending = this.pendingCommands.get(message.id);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this.pendingCommands.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error));
    } else {
      pending.resolve(message);
    }
  }

  private send<T extends CommandMessage>(command: T): Promise<ResponseFor<T>> {
    return new Promise((resolve, reject) => {
      const socket = this.ensureConnection();

      if (socket.readyState !== WebSocket.OPEN) {
        reject(new Error("Extension connection is not open"));
        return;
      }

      const id = ++this.commandId;
      const { type, ...payload } = command;
      const detail = Object.keys(payload).length > 0 ? ` ${JSON.stringify(payload)}` : "";

      const timeoutId = setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          this.logger.log("Command timeout", {
            type,
            pending: this.pendingCommands.size.toString(),
            wsState: this.ws?.readyState.toString() ?? "null",
          });
          reject(new Error(`Command timeout: ${type}${detail}`));
        }
      }, this.commandTimeoutMs);

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- ResponseFor<T> ⊆ ResponseMessage
      const typedResolve = resolve as (value: ResponseMessage) => void;
      this.pendingCommands.set(id, {
        resolve: typedResolve,
        reject,
        timeoutId,
      });

      try {
        socket.send(JSON.stringify({ id, ...command }));
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingCommands.delete(id);
        const reason = error instanceof Error ? error.message : String(error);
        reject(new Error(`Failed to send command: ${reason}`));
      }
    });
  }

  private ensureConnection(): WebSocket {
    if (!this.ws) {
      throw new Error("Extension not connected");
    }
    return this.ws;
  }

  navigate(url: string) {
    return this.send({ type: "navigate", url });
  }
  getUrl() {
    return this.send({ type: "getUrl" });
  }
  fill(selector: string, value: string, options?: IframeOption) {
    return this.send({ type: "fill", selector, value, ...options });
  }
  click(selector: string, options?: IframeOption) {
    return this.send({ type: "click", selector, ...options });
  }
  cdpClick(x: number, y: number) {
    return this.send({ type: "cdpClick", x, y });
  }
  waitForSelector(selector: string, timeout = 10000, options?: IframeOption) {
    return this.send({ type: "waitForSelector", selector, timeout, ...options });
  }
  getContent(selector?: string, options: { html?: boolean } & IframeOption = {}) {
    return this.send({ type: "getContent", ...(selector ? { selector } : {}), ...options });
  }
  async getText(selector?: string): Promise<string> {
    const result = await this.getContent(selector);
    return result.content;
  }
  querySelectorRect(selectors: string[]) {
    return this.send({ type: "querySelectorRect", selectors });
  }
  async clickText(
    texts: string[],
    options: ClickTextOptions = {},
  ): Promise<ResponseFor<"clickText">> {
    const { timeout, ...sendOptions } = options;
    if (timeout === undefined) {
      return this.send({ type: "clickText", texts, ...sendOptions });
    }
    const deadline = Date.now() + timeout;
    let last: ResponseFor<"clickText">;
    do {
      last = await this.send({ type: "clickText", texts, ...sendOptions });
      if (last.found) return last;
      await delay(500);
    } while (Date.now() < deadline);
    return last;
  }
  async cdpClickSelector(selectors: string[]): Promise<CdpClickSelectorResult> {
    const rect = await this.querySelectorRect(selectors);
    if (!rect.found) return { found: false };
    if (rect.rect.width <= 0 || rect.rect.height <= 0) return { found: false };
    const cx = rect.rect.left + rect.rect.width / 2;
    const cy = rect.rect.top + rect.rect.height / 2;
    await this.cdpClick(cx, cy);
    return { found: true, selector: rect.selector };
  }
  async waitForText(texts: string[], timeout = 10000): Promise<WaitForTextResult> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const body = await this.getText();
      const match = texts.find((candidate) => body.includes(candidate));
      if (match) return { found: true, text: match };
      await delay(500);
    }
    return { found: false };
  }
  async waitForUrl(pattern: string, timeout = 10000): Promise<WaitForUrlResult> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const { url } = await this.getUrl();
      if (url.includes(pattern)) return { found: true, url };
      await delay(500);
    }
    return { found: false };
  }
  ping() {
    return this.send({ type: "ping" });
  }
  selectOption(selector: string, values: string[], options?: IframeOption) {
    return this.send({ type: "select", selector, values, ...options });
  }
  type(selector: string, text: string) {
    return this.send({
      type: "keyboard",
      action: "type" as const,
      text,
      selector,
    });
  }
  press(key: string) {
    return this.send({ type: "keyboard", action: "press" as const, key });
  }
  keyDown(key: string) {
    return this.send({ type: "keyboard", action: "down" as const, key });
  }
  keyUp(key: string) {
    return this.send({ type: "keyboard", action: "up" as const, key });
  }
  check(selector: string, options?: IframeOption) {
    return this.send({ type: "check", selector, checked: true, ...options });
  }
  uncheck(selector: string, options?: IframeOption) {
    return this.send({ type: "check", selector, checked: false, ...options });
  }
  scrollIntoView(selector: string, options?: IframeOption) {
    return this.send({
      type: "scroll",
      mode: "intoView" as const,
      selector,
      ...options,
    });
  }
  scrollTo(x: number, y: number) {
    return this.send({ type: "scroll", mode: "to" as const, x, y });
  }
  scrollBy(x: number, y: number) {
    return this.send({ type: "scroll", mode: "by" as const, x, y });
  }
  async getFrameId(selector: string): Promise<number> {
    const result = await this.send({ type: "getFrameId", selector });
    if (!result.found) {
      throw new Error(`Frame not found for selector: ${selector}`);
    }
    return result.frameId;
  }

  sendStepUpdate(update: StepUpdate): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "stepUpdate", ...update }));
  }

  onControl(handler: (action: string) => void): void {
    this.controlHandler = handler;
  }

  offControl(): void {
    this.controlHandler = null;
  }

  stepRunnerDeps(): Omit<StepRunnerDeps, "taskLogger"> {
    return {
      sendStepUpdate: (update) => {
        this.sendStepUpdate(update);
      },
      onControl: (handler) => {
        this.onControl(handler);
      },
      ...(this.pauseOnError !== undefined && { pauseOnError: this.pauseOnError }),
    };
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingCommands.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pendingCommands.clear();
  }

  close(): void {
    this.rejectAllPending(new Error("Browser closed"));

    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
