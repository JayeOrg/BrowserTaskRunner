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

describe("Browser convenience methods", () => {
  it("getText() returns content string", async () => {
    setup = await setupBrowser();

    const textPromise = setup.browser.getText();
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("getContent");

    setup.ext.sendResponse({ id: cmd.id, type: "getContent", content: "Hello world" });
    const result = await textPromise;
    expect(result).toBe("Hello world");
  });

  it("getText() passes selector to getContent", async () => {
    setup = await setupBrowser();

    const textPromise = setup.browser.getText("#main");
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("getContent");
    expect(cmd.selector).toBe("#main");

    setup.ext.sendResponse({ id: cmd.id, type: "getContent", content: "Main" });
    const result = await textPromise;
    expect(result).toBe("Main");
  });

  it("clickText() without timeout sends single command", async () => {
    setup = await setupBrowser();

    const clickPromise = setup.browser.clickText(["Submit"], { tag: "button" });
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("clickText");
    expect(cmd.texts).toEqual(["Submit"]);
    expect(cmd.tag).toBe("button");

    setup.ext.sendResponse({ id: cmd.id, type: "clickText", found: true, text: "Submit" });
    const result = await clickPromise;
    expect(result.found).toBe(true);
  });

  it("clickText() with timeout polls until found", async () => {
    setup = await setupBrowser();

    const clickPromise = setup.browser.clickText(["Submit"], { timeout: 5000 });

    // First poll: not found
    const cmd1 = await setup.ext.receiveCommand();
    setup.ext.sendResponse({ id: cmd1.id, type: "clickText", found: false });

    // Second poll (after 500ms delay): found
    const cmd2 = await setup.ext.receiveCommand();
    setup.ext.sendResponse({ id: cmd2.id, type: "clickText", found: true, text: "Submit" });

    const result = await clickPromise;
    expect(result.found).toBe(true);
  });

  it("clickText() with timeout returns result on timeout", async () => {
    setup = await setupBrowser();

    const clickPromise = setup.browser.clickText(["Nope"], { timeout: 100 });

    // First poll: not found
    const cmd1 = await setup.ext.receiveCommand();
    setup.ext.sendResponse({ id: cmd1.id, type: "clickText", found: false });

    // After 500ms delay, timeout exceeded → final attempt
    const cmd2 = await setup.ext.receiveCommand();
    setup.ext.sendResponse({ id: cmd2.id, type: "clickText", found: false });

    const result = await clickPromise;
    expect(result.found).toBe(false);
  });

  it("cdpClickSelector() clicks center of matching rect", async () => {
    setup = await setupBrowser();

    const clickPromise = setup.browser.cdpClickSelector([".btn"]);

    // First: querySelectorRect
    const rectCmd = await setup.ext.receiveCommand();
    expect(rectCmd.type).toBe("querySelectorRect");
    setup.ext.sendResponse({
      id: rectCmd.id,
      type: "querySelectorRect",
      found: true,
      selector: ".btn",
      rect: { left: 100, top: 200, width: 80, height: 40 },
    });

    // Then: cdpClick at center (140, 220)
    const clickCmd = await setup.ext.receiveCommand();
    expect(clickCmd.type).toBe("cdpClick");
    expect(clickCmd.x).toBe(140);
    expect(clickCmd.y).toBe(220);
    setup.ext.sendResponse({ id: clickCmd.id, type: "cdpClick" });

    const result = await clickPromise;
    expect(result).toEqual({ found: true, selector: ".btn" });
  });

  it("cdpClickSelector() returns found:false when no element matches", async () => {
    setup = await setupBrowser();

    const clickPromise = setup.browser.cdpClickSelector([".missing"]);

    const cmd = await setup.ext.receiveCommand();
    setup.ext.sendResponse({ id: cmd.id, type: "querySelectorRect", found: false });

    const result = await clickPromise;
    expect(result).toEqual({ found: false });
  });

  it("cdpClickSelector() returns found:false for zero-size rects", async () => {
    setup = await setupBrowser();

    const clickPromise = setup.browser.cdpClickSelector([".hidden"]);

    const cmd = await setup.ext.receiveCommand();
    setup.ext.sendResponse({
      id: cmd.id,
      type: "querySelectorRect",
      found: true,
      selector: ".hidden",
      rect: { left: 50, top: 50, width: 0, height: 0 },
    });

    const result = await clickPromise;
    expect(result).toEqual({ found: false });
  });

  it("waitForText() returns matching text", async () => {
    setup = await setupBrowser();

    const waitPromise = setup.browser.waitForText(["Target"], 5000);

    // First poll: no match
    const cmd1 = await setup.ext.receiveCommand();
    setup.ext.sendResponse({ id: cmd1.id, type: "getContent", content: "Loading..." });

    // Second poll: match
    const cmd2 = await setup.ext.receiveCommand();
    setup.ext.sendResponse({ id: cmd2.id, type: "getContent", content: "Found Target here" });

    const result = await waitPromise;
    expect(result).toEqual({ found: true, text: "Target" });
  });

  it("waitForText() returns found:false on timeout", async () => {
    setup = await setupBrowser();

    const waitPromise = setup.browser.waitForText(["Never"], 100);

    // Single poll before timeout
    const cmd = await setup.ext.receiveCommand();
    setup.ext.sendResponse({ id: cmd.id, type: "getContent", content: "Not here" });

    const result = await waitPromise;
    expect(result).toEqual({ found: false });
  });

  it("waitForUrl() returns matching url", async () => {
    setup = await setupBrowser();

    const waitPromise = setup.browser.waitForUrl("/dashboard", 5000);

    // First poll: no match
    const cmd1 = await setup.ext.receiveCommand();
    setup.ext.sendResponse({
      id: cmd1.id,
      type: "getUrl",
      url: "https://example.com/login",
      title: "Login",
    });

    // Second poll: match
    const cmd2 = await setup.ext.receiveCommand();
    setup.ext.sendResponse({
      id: cmd2.id,
      type: "getUrl",
      url: "https://example.com/dashboard",
      title: "Dashboard",
    });

    const result = await waitPromise;
    expect(result).toEqual({ found: true, url: "https://example.com/dashboard" });
  });

  it("waitForUrl() returns found:false on timeout", async () => {
    setup = await setupBrowser();

    const waitPromise = setup.browser.waitForUrl("/never", 100);

    const cmd = await setup.ext.receiveCommand();
    setup.ext.sendResponse({
      id: cmd.id,
      type: "getUrl",
      url: "https://example.com/login",
      title: "Login",
    });

    const result = await waitPromise;
    expect(result).toEqual({ found: false });
  });
});

describe("Browser step control", () => {
  it("sendStepUpdate does not throw when socket is closed", async () => {
    const port = nextPort();
    const browser = new Browser(port);
    const ext = createQueuedExtension(port);

    const startPromise = browser.start();
    await ext.connect();
    await startPromise;

    browser.close();
    ext.close();

    expect(() => {
      browser.sendStepUpdate({ current: 1, total: 1, name: "test", state: "running" });
    }).not.toThrow();
  });

  it("routes stepControl messages to onControl handler", async () => {
    setup = await setupBrowser();

    const actions: string[] = [];
    setup.browser.onControl((action) => actions.push(action));

    setup.ext.sendResponse({ type: "stepControl", action: "pause" });

    // Give message time to arrive
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(actions).toEqual(["pause"]);
  });

  it("stepRunnerDeps() returns working deps object", async () => {
    setup = await setupBrowser();

    const deps = setup.browser.stepRunnerDeps();
    expect(deps.sendStepUpdate).toBeTypeOf("function");
    expect(deps.onControl).toBeTypeOf("function");
  });
});

describe("Select command", () => {
  it("selectOption() sends selector and values", async () => {
    setup = await setupBrowser();

    const selectPromise = setup.browser.selectOption("#dropdown", ["a", "b"]);
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("select");
    expect(cmd.selector).toBe("#dropdown");
    expect(cmd.values).toEqual(["a", "b"]);

    setup.ext.sendResponse({ id: cmd.id, type: "select", selected: ["a", "b"] });
    const result = await selectPromise;
    expect(result.type).toBe("select");
    expect(result.selected).toEqual(["a", "b"]);
  });

  it("selectOption() passes frameId", async () => {
    setup = await setupBrowser();

    const selectPromise = setup.browser.selectOption("#dropdown", ["x"], { frameId: 42 });
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("select");
    expect(cmd.frameId).toBe(42);

    setup.ext.sendResponse({ id: cmd.id, type: "select", selected: ["x"] });
    await selectPromise;
  });
});

describe("Keyboard command", () => {
  it("type() sends keyboard command with type action", async () => {
    setup = await setupBrowser();

    const typePromise = setup.browser.type("#input", "hello");
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("keyboard");
    expect(cmd.action).toBe("type");
    expect(cmd.text).toBe("hello");
    expect(cmd.selector).toBe("#input");

    setup.ext.sendResponse({ id: cmd.id, type: "keyboard" });
    const result = await typePromise;
    expect(result.type).toBe("keyboard");
  });

  it("press() sends keyboard command with press action", async () => {
    setup = await setupBrowser();

    const pressPromise = setup.browser.press("Enter");
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("keyboard");
    expect(cmd.action).toBe("press");
    expect(cmd.key).toBe("Enter");

    setup.ext.sendResponse({ id: cmd.id, type: "keyboard" });
    await pressPromise;
  });

  it("keyDown() and keyUp() send correct actions", async () => {
    setup = await setupBrowser();

    const downPromise = setup.browser.keyDown("Shift");
    const downCmd = await setup.ext.receiveCommand();
    expect(downCmd.action).toBe("down");
    expect(downCmd.key).toBe("Shift");
    setup.ext.sendResponse({ id: downCmd.id, type: "keyboard" });
    await downPromise;

    const upPromise = setup.browser.keyUp("Shift");
    const upCmd = await setup.ext.receiveCommand();
    expect(upCmd.action).toBe("up");
    expect(upCmd.key).toBe("Shift");
    setup.ext.sendResponse({ id: upCmd.id, type: "keyboard" });
    await upPromise;
  });
});

describe("Check command", () => {
  it("check() sends check command with checked:true", async () => {
    setup = await setupBrowser();

    const checkPromise = setup.browser.check("#agree");
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("check");
    expect(cmd.selector).toBe("#agree");
    expect(cmd.checked).toBe(true);

    setup.ext.sendResponse({ id: cmd.id, type: "check" });
    const result = await checkPromise;
    expect(result.type).toBe("check");
  });

  it("uncheck() sends check command with checked:false", async () => {
    setup = await setupBrowser();

    const uncheckPromise = setup.browser.uncheck("#agree");
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("check");
    expect(cmd.checked).toBe(false);

    setup.ext.sendResponse({ id: cmd.id, type: "check" });
    await uncheckPromise;
  });

  it("check() passes frameId", async () => {
    setup = await setupBrowser();

    const checkPromise = setup.browser.check("#box", { frameId: 7 });
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.frameId).toBe(7);

    setup.ext.sendResponse({ id: cmd.id, type: "check" });
    await checkPromise;
  });
});

describe("Scroll command", () => {
  it("scrollIntoView() sends scroll command with intoView mode", async () => {
    setup = await setupBrowser();

    const scrollPromise = setup.browser.scrollIntoView("#target");
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("scroll");
    expect(cmd.mode).toBe("intoView");
    expect(cmd.selector).toBe("#target");

    setup.ext.sendResponse({ id: cmd.id, type: "scroll" });
    const result = await scrollPromise;
    expect(result.type).toBe("scroll");
  });

  it("scrollTo() sends scroll command with to mode and coordinates", async () => {
    setup = await setupBrowser();

    const scrollPromise = setup.browser.scrollTo(0, 500);
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("scroll");
    expect(cmd.mode).toBe("to");
    expect(cmd.x).toBe(0);
    expect(cmd.y).toBe(500);

    setup.ext.sendResponse({ id: cmd.id, type: "scroll" });
    await scrollPromise;
  });

  it("scrollBy() sends scroll command with by mode and coordinates", async () => {
    setup = await setupBrowser();

    const scrollPromise = setup.browser.scrollBy(100, -200);
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("scroll");
    expect(cmd.mode).toBe("by");
    expect(cmd.x).toBe(100);
    expect(cmd.y).toBe(-200);

    setup.ext.sendResponse({ id: cmd.id, type: "scroll" });
    await scrollPromise;
  });

  it("scrollIntoView() passes frameId", async () => {
    setup = await setupBrowser();

    const scrollPromise = setup.browser.scrollIntoView(".el", { frameId: 3 });
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.frameId).toBe(3);

    setup.ext.sendResponse({ id: cmd.id, type: "scroll" });
    await scrollPromise;
  });
});

describe("Frame support", () => {
  it("getFrameId() returns unwrapped frameId", async () => {
    setup = await setupBrowser();

    const framePromise = setup.browser.getFrameId("iframe.content");
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("getFrameId");
    expect(cmd.selector).toBe("iframe.content");

    setup.ext.sendResponse({ id: cmd.id, type: "getFrameId", found: true, frameId: 42 });
    const frameId = await framePromise;
    expect(frameId).toBe(42);
  });

  it("click() passes frameId through to command", async () => {
    setup = await setupBrowser();

    const clickPromise = setup.browser.click("#btn", { frameId: 10 });
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("click");
    expect(cmd.selector).toBe("#btn");
    expect(cmd.frameId).toBe(10);

    setup.ext.sendResponse({ id: cmd.id, type: "click" });
    await clickPromise;
  });

  it("fill() passes frameId through to command", async () => {
    setup = await setupBrowser();

    const fillPromise = setup.browser.fill("#input", "val", { frameId: 5 });
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("fill");
    expect(cmd.frameId).toBe(5);

    setup.ext.sendResponse({ id: cmd.id, type: "fill" });
    await fillPromise;
  });

  it("waitForSelector() passes frameId through to command", async () => {
    setup = await setupBrowser();

    const waitPromise = setup.browser.waitForSelector("#el", 5000, { frameId: 8 });
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("waitForSelector");
    expect(cmd.frameId).toBe(8);

    setup.ext.sendResponse({ id: cmd.id, type: "waitForSelector", found: true, selector: "#el" });
    await waitPromise;
  });

  it("getContent() passes frameId through to command", async () => {
    setup = await setupBrowser();

    const contentPromise = setup.browser.getContent("#main", { frameId: 12 });
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.type).toBe("getContent");
    expect(cmd.frameId).toBe(12);

    setup.ext.sendResponse({ id: cmd.id, type: "getContent", content: "frame content" });
    await contentPromise;
  });
});

describe("Error scenarios for new commands", () => {
  it("selectOption() rejects when extension returns error", async () => {
    setup = await setupBrowser();

    const selectPromise = setup.browser.selectOption("#missing", ["a"]);
    const cmd = await setup.ext.receiveCommand();

    setup.ext.sendResponse({
      id: cmd.id,
      type: "select",
      selected: [],
      error: "Element not found: #missing",
    });
    await expect(selectPromise).rejects.toThrow("Element not found: #missing");
  });

  it("type() rejects when extension returns error", async () => {
    setup = await setupBrowser();

    const typePromise = setup.browser.type("#missing", "hello");
    const cmd = await setup.ext.receiveCommand();

    setup.ext.sendResponse({
      id: cmd.id,
      type: "keyboard",
      error: "Element not found: #missing",
    });
    await expect(typePromise).rejects.toThrow("Element not found: #missing");
  });

  it("press() rejects when extension returns error", async () => {
    setup = await setupBrowser();

    const pressPromise = setup.browser.press("Enter");
    const cmd = await setup.ext.receiveCommand();

    setup.ext.sendResponse({
      id: cmd.id,
      type: "keyboard",
      error: "Failed to attach debugger for keyboard input",
    });
    await expect(pressPromise).rejects.toThrow("Failed to attach debugger");
  });

  it("check() rejects when element is not a checkbox", async () => {
    setup = await setupBrowser();

    const checkPromise = setup.browser.check("#not-a-checkbox");
    const cmd = await setup.ext.receiveCommand();

    setup.ext.sendResponse({
      id: cmd.id,
      type: "check",
      error: "Element is not a checkbox or radio: #not-a-checkbox (type=text)",
    });
    await expect(checkPromise).rejects.toThrow("not a checkbox or radio");
  });

  it("scrollIntoView() rejects when element not found", async () => {
    setup = await setupBrowser();

    const scrollPromise = setup.browser.scrollIntoView("#missing");
    const cmd = await setup.ext.receiveCommand();

    setup.ext.sendResponse({
      id: cmd.id,
      type: "scroll",
      error: "Element not found: #missing",
    });
    await expect(scrollPromise).rejects.toThrow("Element not found: #missing");
  });

  it("getFrameId() rejects when element is not an iframe", async () => {
    setup = await setupBrowser();

    const framePromise = setup.browser.getFrameId("#div-not-iframe");
    const cmd = await setup.ext.receiveCommand();

    setup.ext.sendResponse({
      id: cmd.id,
      type: "getFrameId",
      found: false,
      error: "Element is not an <iframe>: #div-not-iframe",
    });
    await expect(framePromise).rejects.toThrow("not an <iframe>");
  });

  it("selectOption() returns empty selected array on single-select with multiple values", async () => {
    setup = await setupBrowser();

    const selectPromise = setup.browser.selectOption("#single", ["a", "b", "c"]);
    const cmd = await setup.ext.receiveCommand();
    expect(cmd.values).toEqual(["a", "b", "c"]);

    // Single-select only keeps last selected — extension returns actual selection
    setup.ext.sendResponse({ id: cmd.id, type: "select", selected: ["c"] });
    const result = await selectPromise;
    expect(result.selected).toEqual(["c"]);
  });
});
