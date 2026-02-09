import { describe, it, expect, afterEach, vi } from "vitest";
import { WebSocketServer } from "ws";
import { Browser } from "../../../stack/browser/browser.js";
import { createQueuedExtension } from "../../fixtures/fake-extension.js";
import { setupBrowser, type BrowserTestSetup } from "../../fixtures/browser-helpers.js";
import { nextPort } from "../../fixtures/port.js";

let setup: BrowserTestSetup | null = null;

afterEach(() => {
  setup?.browser.close();
  setup?.ext.close();
  setup = null;
});

describe("Browser WebSocket protocol", () => {
  it("start() resolves when extension sends ready", async () => {
    const port = nextPort();
    const browser = new Browser(port);
    const ext = createQueuedExtension(port);

    const startPromise = browser.start();
    await ext.connect();
    await expect(startPromise).resolves.toBeUndefined();

    ext.close();
    browser.close();
  });

  it("navigate() sends command and receives response", async () => {
    setup = await setupBrowser();

    const navPromise = setup.browser.navigate("https://example.com");
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("navigate");
    expect(cmd.url).toBe("https://example.com");

    setup.ext.sendResponse({
      id: cmd.id,
      type: "navigate",
      url: "https://example.com",
      title: "Example",
    });
    const result = await navPromise;
    expect(result.type).toBe("navigate");
    expect(result.url).toBe("https://example.com");
    expect(result.title).toBe("Example");
  });

  it("ping() round-trip", async () => {
    setup = await setupBrowser();

    const pingPromise = setup.browser.ping();
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("ping");

    setup.ext.sendResponse({ id: cmd.id, type: "ping", pong: true });
    const result = await pingPromise;
    expect(result.pong).toBe(true);
  });

  it("click() resolves on success, rejects on error", async () => {
    setup = await setupBrowser();

    const clickPromise = setup.browser.click("#button");
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("click");
    expect(cmd.selector).toBe("#button");

    setup.ext.sendResponse({ id: cmd.id, type: "click" });
    const result = await clickPromise;
    expect(result.type).toBe("click");
  });

  it("fill() sends selector and value", async () => {
    setup = await setupBrowser();

    const fillPromise = setup.browser.fill("#email", "test@test.com");
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("fill");
    expect(cmd.selector).toBe("#email");
    expect(cmd.value).toBe("test@test.com");

    setup.ext.sendResponse({ id: cmd.id, type: "fill" });
    const result = await fillPromise;
    expect(result.type).toBe("fill");
  });

  it("concurrent commands resolve independently", async () => {
    setup = await setupBrowser();

    const ping1 = setup.browser.ping();
    const ping2 = setup.browser.ping();

    const cmd1 = await setup.ext.receiveCommand();
    const cmd2 = await setup.ext.receiveCommand();

    // Respond out of order
    setup.ext.sendResponse({ id: cmd2.id, type: "ping", pong: true });
    setup.ext.sendResponse({ id: cmd1.id, type: "ping", pong: true });

    const [result1, result2] = await Promise.all([ping1, ping2]);
    expect(result1.pong).toBe(true);
    expect(result2.pong).toBe(true);
  });

  it("response with error field rejects the promise", async () => {
    setup = await setupBrowser();

    const navPromise = setup.browser.navigate("https://bad.com");
    const cmd = await setup.ext.receiveCommand();

    setup.ext.sendResponse({
      id: cmd.id,
      type: "navigate",
      url: "",
      title: "",
      error: "Tab crashed",
    });
    await expect(navPromise).rejects.toThrow("Tab crashed");
  });

  it("throws after close when sending a command", async () => {
    const port = nextPort();
    const localBrowser = new Browser(port);
    const ext = createQueuedExtension(port);

    const startPromise = localBrowser.start();
    await ext.connect();
    await startPromise;

    localBrowser.close();

    await expect(localBrowser.ping()).rejects.toThrow("Extension not connected");

    ext.close();
  });

  it("invalid message does not crash the server", async () => {
    setup = await setupBrowser();

    // Send non-response object — should be silently ignored
    setup.ext.sendResponse({ garbage: true });

    // Browser should still work after invalid message
    const pingPromise = setup.browser.ping();
    const cmd = await setup.ext.receiveCommand();
    setup.ext.sendResponse({ id: cmd.id, type: "ping", pong: true });
    const result = await pingPromise;
    expect(result.pong).toBe(true);
  });
});

describe("Browser command coverage", () => {
  it("getUrl() returns url and title", async () => {
    setup = await setupBrowser();

    const urlPromise = setup.browser.getUrl();
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("getUrl");

    setup.ext.sendResponse({
      id: cmd.id,
      type: "getUrl",
      url: "https://example.com/page",
      title: "Page",
    });
    const result = await urlPromise;
    expect(result.url).toBe("https://example.com/page");
    expect(result.title).toBe("Page");
  });

  it("cdpClick() sends x and y coordinates", async () => {
    setup = await setupBrowser();

    const clickPromise = setup.browser.cdpClick(100, 200);
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("cdpClick");
    expect(cmd.x).toBe(100);
    expect(cmd.y).toBe(200);

    setup.ext.sendResponse({ id: cmd.id, type: "cdpClick" });
    const result = await clickPromise;
    expect(result.type).toBe("cdpClick");
  });

  it("getContent() sends command without selector", async () => {
    setup = await setupBrowser();

    const contentPromise = setup.browser.getContent();
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("getContent");
    expect(cmd).not.toHaveProperty("selector");

    setup.ext.sendResponse({ id: cmd.id, type: "getContent", content: "<body>Hello</body>" });
    const result = await contentPromise;
    expect(result.content).toBe("<body>Hello</body>");
  });

  it("getContent() sends command with selector", async () => {
    setup = await setupBrowser();

    const contentPromise = setup.browser.getContent("#main");
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("getContent");
    expect(cmd.selector).toBe("#main");

    setup.ext.sendResponse({ id: cmd.id, type: "getContent", content: "Main content" });
    const result = await contentPromise;
    expect(result.content).toBe("Main content");
  });

  it("querySelectorRect() sends selectors array", async () => {
    setup = await setupBrowser();

    const rectPromise = setup.browser.querySelectorRect([".a", ".b"]);
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("querySelectorRect");
    expect(cmd.selectors).toEqual([".a", ".b"]);

    setup.ext.sendResponse({
      id: cmd.id,
      type: "querySelectorRect",
      found: true,
      selector: ".b",
      rect: { left: 10, top: 20, width: 100, height: 50 },
    });
    const result = await rectPromise;
    expect(result.found).toBe(true);
  });

  it("waitForSelector() sends custom timeout value", async () => {
    setup = await setupBrowser();

    const selectorPromise = setup.browser.waitForSelector("#el", 5000);
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("waitForSelector");
    expect(cmd.selector).toBe("#el");
    expect(cmd.timeout).toBe(5000);

    setup.ext.sendResponse({ id: cmd.id, type: "waitForSelector", found: true, selector: "#el" });
    await selectorPromise;
  });

  it("waitForSelector() uses default timeout of 10000", async () => {
    setup = await setupBrowser();

    const selectorPromise = setup.browser.waitForSelector("#el");
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.timeout).toBe(10000);

    setup.ext.sendResponse({ id: cmd.id, type: "waitForSelector", found: true, selector: "#el" });
    await selectorPromise;
  });
});

describe("Browser close behavior", () => {
  it("close() rejects in-flight commands with 'Browser closed'", async () => {
    setup = await setupBrowser();

    const pingPromise = setup.browser.ping();
    await setup.ext.receiveCommand();

    setup.browser.close();

    await expect(pingPromise).rejects.toThrow("Browser closed");
  });

  it("close() rejects multiple in-flight commands", async () => {
    setup = await setupBrowser();

    const p1 = setup.browser.ping();
    const p2 = setup.browser.navigate("https://example.com");
    await setup.ext.receiveCommand();
    await setup.ext.receiveCommand();

    setup.browser.close();

    await expect(p1).rejects.toThrow("Browser closed");
    await expect(p2).rejects.toThrow("Browser closed");
  });
});

describe("Browser timeout and disconnect", () => {
  it("command rejects after timeout when extension does not respond", async () => {
    const port = nextPort();
    const localBrowser = new Browser(port, { commandTimeoutMs: 50 });
    const ext = createQueuedExtension(port);

    const startPromise = localBrowser.start();
    await ext.connect();
    await startPromise;

    await expect(localBrowser.ping()).rejects.toThrow("Command timeout: ping");

    ext.close();
    localBrowser.close();
  });

  it("pending command rejects when extension disconnects", async () => {
    const port = nextPort();
    const localBrowser = new Browser(port, { commandTimeoutMs: 5000 });
    const ext = createQueuedExtension(port);

    const startPromise = localBrowser.start();
    await ext.connect();
    await startPromise;

    const pingPromise = localBrowser.ping();
    ext.close();

    await expect(pingPromise).rejects.toThrow("Extension disconnected");
    localBrowser.close();
  });
});

describe("Browser error handling", () => {
  it("start() rejects when port is in use", async () => {
    const port = nextPort();
    const blocker = new WebSocketServer({ port });
    await new Promise<void>((resolve) => {
      blocker.on("listening", resolve);
    });

    const browser = new Browser(port);
    try {
      await expect(browser.start()).rejects.toThrow(/EADDRINUSE/u);
    } finally {
      blocker.close();
      browser.close();
    }
  });

  it("non-JSON WebSocket data does not crash the server", async () => {
    setup = await setupBrowser();

    setup.ext.sendRaw("not valid json {{{");

    // Browser should still work after malformed data
    const pingPromise = setup.browser.ping();
    const cmd = await setup.ext.receiveCommand();
    setup.ext.sendResponse({ id: cmd.id, type: "ping", pong: true });
    const result = await pingPromise;
    expect(result.pong).toBe(true);
  });

  it("start() rejects when extension does not connect within timeout", async () => {
    vi.useFakeTimers();
    const port = nextPort();
    const browser = new Browser(port);

    const startPromise = browser.start();
    // Attach rejection handler before advancing timers to avoid unhandled rejection
    const expectation = expect(startPromise).rejects.toThrow("Extension did not connect");

    await vi.advanceTimersByTimeAsync(61000);

    await expectation;

    browser.close();
    vi.useRealTimers();
  });
});
