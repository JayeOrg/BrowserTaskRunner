import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { Browser } from "../../stack/browser/browser.js";
import {
  createRespondingExtension,
  type CommandResponder,
  type ReceivedCommand,
} from "./fake-extension.js";
import { nextPort } from "./port.js";
import { createTaskLogger } from "../../stack/framework/logging.js";

export const noopLogger = createTaskLogger("test", () => undefined);

// --- Test site ---

const DEFAULT_PAGE_HTML = '<button id="go">Click me</button>';
const DEFAULT_SUCCESS_HTML = "<h1>Success</h1>";

type HttpRequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

function defaultHttpRequestHandler(req: IncomingMessage, res: ServerResponse): void {
  if (req.url === "/success") {
    res.end(DEFAULT_SUCCESS_HTML);
  } else {
    res.end(DEFAULT_PAGE_HTML);
  }
}

export function startTestSite(
  handler?: HttpRequestHandler,
): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler ?? defaultHttpRequestHandler);
    server.on("error", reject);
    server.listen(0, () => {
      const addr = server.address();
      if (typeof addr === "object" && addr !== null) {
        resolve({ server, url: `http://localhost:${addr.port.toString()}` });
      } else {
        reject(new Error("server.address() returned unexpected value"));
      }
    });
  });
}

// --- Task test setup ---

export interface TaskTestSetup {
  browser: Browser;
  ext: ReturnType<typeof createRespondingExtension>;
  siteUrl: string;
  site: { server: Server; url: string };
}

export async function setupTaskTest(
  respond: CommandResponder,
  siteHandler?: HttpRequestHandler,
  state?: ResponderState,
): Promise<TaskTestSetup> {
  const site = await startTestSite(siteHandler);
  const port = nextPort();
  const browser = new Browser(port, { pauseOnError: false });
  const ext = createRespondingExtension(port, respond);

  const startPromise = browser.start();
  await ext.connect();
  await startPromise;
  await browser.ping();

  if (state) {
    state.siteUrl = site.url;
  }

  return { browser, ext, siteUrl: site.url, site };
}

// --- Default command responder ---

type CommandOverride = (cmd: ReceivedCommand, state: ResponderState) => Record<string, unknown>;

export interface ResponderState {
  currentUrl: string;
  siteUrl: string;
  commands: string[];
}

/**
 * Build a command responder with sensible defaults for every command type.
 * Pass `overrides` to replace individual handlers — each override completely
 * replaces the default for that command type. The returned `state` object is
 * mutated by the responder (tracks `currentUrl`, `commands` history, etc.).
 */
export function createDefaultResponder(overrides?: Partial<Record<string, CommandOverride>>): {
  responder: CommandResponder;
  state: ResponderState;
} {
  const state: ResponderState = { currentUrl: "", siteUrl: "", commands: [] };

  const responder: CommandResponder = (cmd) => {
    state.commands.push(cmd.type);
    const override = overrides?.[cmd.type];
    if (override) {
      const result = override(cmd, state);
      // Auto-track URL changes from navigate overrides
      if (cmd.type === "navigate" && "url" in result && typeof result.url === "string") {
        state.currentUrl = result.url;
      }
      return result;
    }

    switch (cmd.type) {
      case "ping":
        return { type: "ping", pong: true };
      case "navigate":
        state.currentUrl = String(cmd.url);
        return { type: "navigate", url: state.currentUrl, title: "Test Page" };
      case "waitForSelector":
        return { type: "waitForSelector", found: true, selector: String(cmd.selector) };
      case "click":
        state.currentUrl = `${state.siteUrl}/success`;
        return { type: "click", success: true };
      case "getUrl":
        return { type: "getUrl", url: state.currentUrl, title: "Page" };
      case "getContent":
        return { type: "getContent", content: "" };
      case "fill":
        return { type: "fill" };
      case "select":
        return { type: "select", selected: [] };
      case "keyboard":
        return { type: "keyboard" };
      case "check":
        return { type: "check" };
      case "scroll":
        return { type: "scroll" };
      case "getFrameId":
        return { type: "getFrameId", found: true, frameId: 0 };
      default:
        return { type: cmd.type, error: `Unexpected: ${cmd.type}` };
    }
  };

  return { responder, state };
}
