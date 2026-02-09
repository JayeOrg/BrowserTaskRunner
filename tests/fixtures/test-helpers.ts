import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { Browser } from "../../stack/browser/browser.js";
import {
  createRespondingExtension,
  type CommandResponder,
  type ReceivedCommand,
} from "./fake-extension.js";
import { nextPort } from "./port.js";

// --- Test site ---

const DEFAULT_PAGE_HTML = '<button id="go">Click me</button>';
const DEFAULT_SUCCESS_HTML = "<h1>Success</h1>";

type SiteHandler = (req: IncomingMessage, res: ServerResponse) => void;

function defaultSiteHandler(req: IncomingMessage, res: ServerResponse): void {
  if (req.url === "/success") {
    res.end(DEFAULT_SUCCESS_HTML);
  } else {
    res.end(DEFAULT_PAGE_HTML);
  }
}

export function startTestSite(handler?: SiteHandler): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(handler ?? defaultSiteHandler);
    server.listen(0, () => {
      const addr = server.address();
      if (typeof addr === "object" && addr !== null) {
        resolve({ server, url: `http://localhost:${addr.port.toString()}` });
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
  siteHandler?: SiteHandler,
): Promise<TaskTestSetup> {
  const site = await startTestSite(siteHandler);
  const port = nextPort();
  const browser = new Browser(port);
  const ext = createRespondingExtension(port, respond);

  const startPromise = browser.start();
  await ext.connect();
  await startPromise;
  await browser.ping();

  return { browser, ext, siteUrl: site.url, site };
}

// --- Default command responder ---

type CommandOverride = (cmd: ReceivedCommand, state: ResponderState) => Record<string, unknown>;

export interface ResponderState {
  currentUrl: string;
  siteUrl: string;
  commands: string[];
}

export function createDefaultResponder(overrides?: Partial<Record<string, CommandOverride>>): {
  responder: CommandResponder;
  state: ResponderState;
} {
  const state: ResponderState = { currentUrl: "", siteUrl: "", commands: [] };

  const responder: CommandResponder = (cmd) => {
    state.commands.push(cmd.type);
    const override = overrides?.[cmd.type];
    if (override) return override(cmd, state);

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
      default:
        return { type: cmd.type, error: `Unexpected: ${cmd.type}` };
    }
  };

  return { responder, state };
}
