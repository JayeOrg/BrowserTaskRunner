import { WebSocketServer, WebSocket } from "ws";
import type { CommandMessage, ResponseMessage, ResponseFor } from "../extension/messages/index.js";
import { createPrefixLogger, type PrefixLogger } from "../framework/logging.js";
import { logConnectionInstructions } from "./instructions.js";

export interface BrowserOptions {
  commandTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

export interface BrowserAPI {
  navigate(url: string): Promise<ResponseFor<"navigate">>;
  getUrl(): Promise<ResponseFor<"getUrl">>;
  fill(selector: string, value: string): Promise<ResponseFor<"fill">>;
  click(selector: string): Promise<ResponseFor<"click">>;
  cdpClick(x: number, y: number): Promise<ResponseFor<"cdpClick">>;
  waitForSelector(selector: string, timeout?: number): Promise<ResponseFor<"waitForSelector">>;
  getContent(selector?: string, options?: { html?: boolean }): Promise<ResponseFor<"getContent">>;
  querySelectorRect(selectors: string[]): Promise<ResponseFor<"querySelectorRect">>;
  clickText(
    texts: string[],
    options?: { tag?: string; exact?: boolean; cdp?: boolean },
  ): Promise<ResponseFor<"clickText">>;
  ping(): Promise<ResponseFor<"ping">>;
}

/*
 * Intentionally loose: checks structure, not known type values. The narrowing to
 * ResponseMessage is technically unsound (any {type: string} passes), but harmless —
 * handleResponse drops messages with unrecognized IDs. Validating against a set of
 * known types would duplicate info already in the ResponseMessage union and require
 * manual updates when adding commands.
 */
function isResponseMessage(value: unknown): value is ResponseMessage {
  return (
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
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
  private readonly logger: PrefixLogger;
  private ws: WebSocket | null = null;
  private server: WebSocketServer | null = null;
  private pendingCommands: Map<number, PendingCommand> = new Map();
  private commandId = 0;

  constructor(port: number, options: BrowserOptions = {}) {
    this.port = port;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 30000;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 60000;
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

      this.server?.on("connection", (ws: WebSocket) => {
        this.ws = ws;
        ws.on("close", () => {
          this.ws = null;
          this.rejectAllPending(new Error("Extension disconnected"));
        });
        ws.on("message", (data: Buffer) => {
          const message = this.parseMessage(data);
          if (!message) return;

          if (message.type === "ready") {
            clearTimeout(timeout);
            this.server?.removeListener("error", onServerError);
            resolve();
            return;
          }

          this.handleResponse(message);
        });
      });
    });
  }

  private parseMessage(data: Buffer): ResponseMessage | null {
    try {
      const parsed: unknown = JSON.parse(data.toString());
      if (!isResponseMessage(parsed)) {
        this.logger.log("Invalid message format");
        return null;
      }
      return parsed;
    } catch (error) {
      this.logger.log("Error parsing message", { error: String(error) });
      return null;
    }
  }

  private handleResponse(message: ResponseMessage): void {
    if (message.id === undefined) return;

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
          reject(new Error(`Command timeout: ${type}${detail}`));
        }
      }, this.commandTimeoutMs);

      // ResponseFor<T> is always a subtype of ResponseMessage, so this is safe
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
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

  // Browser commands
  navigate(url: string) {
    return this.send({ type: "navigate", url });
  }
  getUrl() {
    return this.send({ type: "getUrl" });
  }
  fill(selector: string, value: string) {
    return this.send({ type: "fill", selector, value });
  }
  click(selector: string) {
    return this.send({ type: "click", selector });
  }
  cdpClick(x: number, y: number) {
    return this.send({ type: "cdpClick", x, y });
  }
  waitForSelector(selector: string, timeout = 10000) {
    return this.send({ type: "waitForSelector", selector, timeout });
  }
  getContent(selector?: string, options: { html?: boolean } = {}) {
    return this.send({ type: "getContent", ...(selector ? { selector } : {}), ...options });
  }
  querySelectorRect(selectors: string[]) {
    return this.send({ type: "querySelectorRect", selectors });
  }
  clickText(texts: string[], options: { tag?: string; exact?: boolean; cdp?: boolean } = {}) {
    return this.send({ type: "clickText", texts, ...options });
  }
  ping() {
    return this.send({ type: "ping" });
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
