import WebSocket from "ws";
import {
  isIncomingCommand,
  type IncomingCommand,
  type ResponseMessage,
} from "../../stack/extension/messages/index.js";

// Narrows IncomingCommand (id optional) to require id — Browser.send() always assigns one.
export type ReceivedCommand = IncomingCommand & { id: number };

export function isReceivedCommand(raw: unknown): raw is ReceivedCommand {
  return isIncomingCommand(raw) && "id" in raw && typeof raw.id === "number";
}

// --- Shared connect logic ---

async function connectExtension(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${port.toString()}`);
  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "ready" }));
      resolve();
    });
    ws.on("error", reject);
  });
  return ws;
}

// --- Queue-based extension (protocol tests) ---

export function createQueuedExtension(port: number) {
  let ws: WebSocket | null = null;
  const commandQueue: ReceivedCommand[] = [];
  let commandWaiter: ((cmd: ReceivedCommand) => void) | null = null;

  return {
    async connect(): Promise<void> {
      ws = await connectExtension(port);
      ws.on("message", (data: Buffer) => {
        const raw: unknown = JSON.parse(data.toString());
        if (!isReceivedCommand(raw)) throw new Error("Invalid command from Browser");
        if (commandWaiter) {
          const waiter = commandWaiter;
          commandWaiter = null;
          waiter(raw);
        } else {
          commandQueue.push(raw);
        }
      });
    },

    receiveCommand(): Promise<ReceivedCommand> {
      const queued = commandQueue.shift();
      if (queued) {
        return Promise.resolve(queued);
      }
      return new Promise((resolve) => {
        commandWaiter = resolve;
      });
    },

    sendResponse(response: Record<string, unknown>): void {
      ws?.send(JSON.stringify(response));
    },

    sendRaw(data: string): void {
      ws?.send(data);
    },

    close(): void {
      ws?.terminate();
      ws = null;
    },
  };
}

// --- Callback-based extension (E2E tests) ---

export type CommandResponder = (cmd: ReceivedCommand) => ResponseMessage;

export function createRespondingExtension(port: number, respond: CommandResponder) {
  let ws: WebSocket | null = null;

  return {
    async connect(): Promise<void> {
      ws = await connectExtension(port);
      ws.on("message", (data: Buffer) => {
        const raw: unknown = JSON.parse(data.toString());
        if (!isReceivedCommand(raw)) return;
        const response = respond(raw);
        ws?.send(JSON.stringify({ id: raw.id, ...response }));
      });
    },

    close(): void {
      ws?.terminate();
      ws = null;
    },
  };
}
