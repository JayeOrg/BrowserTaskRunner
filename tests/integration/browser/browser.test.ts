import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { Browser } from "../../../stack/browser/browser.js";

// Each test gets a unique port to avoid conflicts
let portCounter = 19200;
function nextPort(): number {
  portCounter++;
  return portCounter;
}

interface ReceivedCommand {
  id: number;
  type: string;
  [key: string]: unknown;
}

function isReceivedCommand(raw: unknown): raw is ReceivedCommand {
  return typeof raw === "object" && raw !== null && "id" in raw && "type" in raw;
}

function toReceivedCommand(raw: unknown): ReceivedCommand {
  if (!isReceivedCommand(raw)) {
    throw new Error("Invalid command from Browser");
  }
  return raw;
}

/**
 * Fake extension client that connects to the Browser's WebSocket server.
 * Simulates what the real Chrome extension does: connect, send ready, handle commands.
 */
function createFakeExtension(port: number) {
  let ws: WebSocket | null = null;
  const commandQueue: ReceivedCommand[] = [];
  let commandWaiter: ((cmd: ReceivedCommand) => void) | null = null;

  return {
    async connect(): Promise<void> {
      ws = new WebSocket(`ws://localhost:${port.toString()}`);
      await new Promise<void>((resolve, reject) => {
        ws?.on("open", () => {
          ws?.send(JSON.stringify({ type: "ready" }));
          resolve();
        });
        ws?.on("error", reject);
      });

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

    close(): void {
      ws?.terminate();
      ws = null;
    },
  };
}

let browser: Browser | null = null;

afterEach(() => {
  browser?.close();
  browser = null;
});

describe("Browser WebSocket protocol", () => {
  it("start() resolves when extension sends ready", async () => {
    const port = nextPort();
    browser = new Browser(port);

    const startPromise = browser.start();
    const ext = createFakeExtension(port);
    await ext.connect();
    await expect(startPromise).resolves.toBeUndefined();

    ext.close();
  });

  it("navigate() sends command and receives response", async () => {
    const port = nextPort();
    browser = new Browser(port);
    const ext = createFakeExtension(port);

    const startPromise = browser.start();
    await ext.connect();
    await startPromise;

    const navPromise = browser.navigate("https://example.com");
    const cmd = await ext.receiveCommand();
    expect(cmd.type).toBe("navigate");
    expect(cmd.url).toBe("https://example.com");

    ext.sendResponse({
      id: cmd.id,
      type: "navigate",
      url: "https://example.com",
      title: "Example",
    });
    const result = await navPromise;
    expect(result.type).toBe("navigate");
    expect(result.url).toBe("https://example.com");
    expect(result.title).toBe("Example");

    ext.close();
  });

  it("ping() round-trip", async () => {
    const port = nextPort();
    browser = new Browser(port);
    const ext = createFakeExtension(port);

    const startPromise = browser.start();
    await ext.connect();
    await startPromise;

    const pingPromise = browser.ping();
    const cmd = await ext.receiveCommand();
    expect(cmd.type).toBe("ping");

    ext.sendResponse({ id: cmd.id, type: "ping", pong: true });
    const result = await pingPromise;
    expect(result.pong).toBe(true);

    ext.close();
  });

  it("click() returns success/failure from extension", async () => {
    const port = nextPort();
    browser = new Browser(port);
    const ext = createFakeExtension(port);

    const startPromise = browser.start();
    await ext.connect();
    await startPromise;

    const clickPromise = browser.click("#button");
    const cmd = await ext.receiveCommand();
    expect(cmd.type).toBe("click");
    expect(cmd.selector).toBe("#button");

    ext.sendResponse({ id: cmd.id, type: "click", success: true });
    const result = await clickPromise;
    expect(result.success).toBe(true);

    ext.close();
  });

  it("fill() sends selector and value", async () => {
    const port = nextPort();
    browser = new Browser(port);
    const ext = createFakeExtension(port);

    const startPromise = browser.start();
    await ext.connect();
    await startPromise;

    const fillPromise = browser.fill("#email", "test@test.com");
    const cmd = await ext.receiveCommand();
    expect(cmd.type).toBe("fill");
    expect(cmd.selector).toBe("#email");
    expect(cmd.value).toBe("test@test.com");

    ext.sendResponse({ id: cmd.id, type: "fill", success: true });
    const result = await fillPromise;
    expect(result.success).toBe(true);

    ext.close();
  });

  it("concurrent commands resolve independently", async () => {
    const port = nextPort();
    browser = new Browser(port);
    const ext = createFakeExtension(port);

    const startPromise = browser.start();
    await ext.connect();
    await startPromise;

    // Send two commands concurrently
    const ping1 = browser.ping();
    const ping2 = browser.ping();

    const cmd1 = await ext.receiveCommand();
    const cmd2 = await ext.receiveCommand();

    // Respond out of order
    ext.sendResponse({ id: cmd2.id, type: "ping", pong: true });
    ext.sendResponse({ id: cmd1.id, type: "ping", pong: true });

    const [result1, result2] = await Promise.all([ping1, ping2]);
    expect(result1.pong).toBe(true);
    expect(result2.pong).toBe(true);

    ext.close();
  });

  it("response with error field rejects the promise", async () => {
    const port = nextPort();
    browser = new Browser(port);
    const ext = createFakeExtension(port);

    const startPromise = browser.start();
    await ext.connect();
    await startPromise;

    const navPromise = browser.navigate("https://bad.com");
    const cmd = await ext.receiveCommand();

    ext.sendResponse({ id: cmd.id, type: "navigate", url: "", title: "", error: "Tab crashed" });
    await expect(navPromise).rejects.toThrow("Tab crashed");

    ext.close();
  });

  it("throws after close when sending a command", async () => {
    const port = nextPort();
    const localBrowser = new Browser(port);
    const ext = createFakeExtension(port);

    const startPromise = localBrowser.start();
    await ext.connect();
    await startPromise;

    localBrowser.close();

    // EnsureConnection() throws inside the Promise executor, rejecting the promise
    await expect(localBrowser.ping()).rejects.toThrow("Extension not connected");

    ext.close();
  });

  it("invalid message does not crash the server", async () => {
    const port = nextPort();
    browser = new Browser(port);
    const ext = createFakeExtension(port);

    const startPromise = browser.start();
    await ext.connect();
    await startPromise;

    // Send garbage — should be silently ignored
    ext.sendResponse({ garbage: true });

    // Browser should still work after invalid message
    const pingPromise = browser.ping();
    const cmd = await ext.receiveCommand();
    ext.sendResponse({ id: cmd.id, type: "ping", pong: true });
    const result = await pingPromise;
    expect(result.pong).toBe(true);

    ext.close();
  });
});
