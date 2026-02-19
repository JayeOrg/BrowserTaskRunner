import WebSocket from "ws";

// --- Shared types ---

export interface ReceivedCommand {
  id: number;
  type: string;
  [key: string]: unknown;
}

export function isReceivedCommand(raw: unknown): raw is ReceivedCommand {
  return typeof raw === "object" && raw !== null && "id" in raw && "type" in raw;
}

function toReceivedCommand(raw: unknown): ReceivedCommand {
  if (!isReceivedCommand(raw)) {
    throw new Error("Invalid command from Browser");
  }
  return raw;
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
        const parsed = toReceivedCommand(raw);
        if (commandWaiter) {
          const waiter = commandWaiter;
          commandWaiter = null;
          waiter(parsed);
        } else {
          commandQueue.push(parsed);
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

export type CommandResponder = (cmd: ReceivedCommand) => Record<string, unknown>;

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
