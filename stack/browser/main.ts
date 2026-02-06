import { WebSocketServer, type WebSocket } from "ws";
import type {
  CommandMessage,
  ResponseMessage,
  ResponseFor,
} from "../extension/messages/index.js";
import { createPrefixLogger } from "../framework/logging.js";
import { logConnectionInstructions } from "./instructions.js";

export type { CommandMessage, ResponseMessage, ResponseFor };

const logger = createPrefixLogger("Browser");

function isResponseMessage(value: unknown): value is ResponseMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

interface PendingCommand {
  resolve: (value: ResponseMessage) => void;
  reject: (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class Browser {
  private readonly port: number;
  private ws: WebSocket | null = null;
  private server: WebSocketServer | null = null;
  private pendingCommands: Map<number, PendingCommand> = new Map();
  private commandId = 0;

  constructor(port: number) {
    this.port = port;
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = new WebSocketServer({ port: this.port });
    this.server.on("listening", () => {
      logConnectionInstructions(logger, this.port);
    });

    await this.waitForConnection();
  }

  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutMs = 60000;
      const timeout = setTimeout(() => {
        reject(new Error("Extension did not connect within 60 seconds"));
      }, timeoutMs);

      const clearTimeoutAndRun = (fn: () => void) => {
        clearTimeout(timeout);
        fn();
      };

      this.server?.on("error", (error: Error) => {
        clearTimeoutAndRun(() => {
          reject(error);
        });
      });

      this.server?.on("connection", (ws: WebSocket) => {
        this.ws = ws;
        ws.on("close", () => {
          this.ws = null;
        });
        ws.on("message", (data: Buffer) => {
          const message = this.parseMessage(data);
          if (!message) return;

          if (message.type === "ready") {
            clearTimeoutAndRun(resolve);
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
        logger.log("Invalid message format");
        return null;
      }
      return parsed;
    } catch (error) {
      logger.log("Error parsing message", { error: String(error) });
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

  send<T extends CommandMessage>(command: T): Promise<ResponseFor<T>> {
    return new Promise((resolve, reject) => {
      const socket = this.ensureConnection();

      const id = ++this.commandId;
      const timeoutId = setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          reject(new Error(`Command timeout: ${command.type}`));
        }
      }, 30000);

      // ResponseFor<T> is always a subtype of ResponseMessage, so this is safe
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const typedResolve = resolve as (value: ResponseMessage) => void;
      this.pendingCommands.set(id, {
        resolve: typedResolve,
        reject,
        timeoutId,
      });
      socket.send(JSON.stringify({ id, ...command }));
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
  getContent(selector: string | null = null) {
    return this.send(
      selector ? { type: "getContent", selector } : { type: "getContent" },
    );
  }
  querySelectorRect(selectors: string[]) {
    return this.send({ type: "querySelectorRect", selectors });
  }
  ping() {
    return this.send({ type: "ping" });
  }

  close(): void {
    for (const pending of this.pendingCommands.values()) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingCommands.clear();

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
