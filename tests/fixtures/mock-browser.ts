import { vi } from "vitest";
import type { BrowserAPI } from "../../stack/browser/browser.js";

export function stubBrowserAPI(): BrowserAPI {
  return {
    navigate: vi.fn().mockResolvedValue({ type: "navigate", url: "", title: "" }),
    getUrl: vi.fn().mockResolvedValue({ type: "getUrl", url: "", title: "" }),
    fill: vi.fn().mockResolvedValue({ type: "fill" }),
    click: vi.fn().mockResolvedValue({ type: "click" }),
    cdpClick: vi.fn().mockResolvedValue({ type: "cdpClick" }),
    waitForSelector: vi.fn().mockResolvedValue({ type: "waitForSelector", found: false }),
    getContent: vi.fn().mockResolvedValue({ type: "getContent", kind: "page", content: "" }),
    getText: vi.fn().mockResolvedValue(""),
    querySelectorRect: vi.fn().mockResolvedValue({ type: "querySelectorRect", found: false }),
    clickText: vi.fn().mockResolvedValue({ type: "clickText", found: false }),
    cdpClickSelector: vi.fn().mockResolvedValue({ found: false }),
    waitForText: vi.fn().mockResolvedValue({ found: false }),
    waitForUrl: vi.fn().mockResolvedValue({ found: false }),
    selectOption: vi.fn().mockResolvedValue({ type: "select", selected: [] }),
    type: vi.fn().mockResolvedValue({ type: "keyboard" }),
    press: vi.fn().mockResolvedValue({ type: "keyboard" }),
    keyDown: vi.fn().mockResolvedValue({ type: "keyboard" }),
    keyUp: vi.fn().mockResolvedValue({ type: "keyboard" }),
    check: vi.fn().mockResolvedValue({ type: "check" }),
    uncheck: vi.fn().mockResolvedValue({ type: "check" }),
    scrollIntoView: vi.fn().mockResolvedValue({ type: "scroll" }),
    scrollTo: vi.fn().mockResolvedValue({ type: "scroll" }),
    scrollBy: vi.fn().mockResolvedValue({ type: "scroll" }),
    getFrameId: vi.fn().mockResolvedValue({ found: true, frameId: 0 }),
    // Compile error here means a new BrowserAPI method needs a mock
  } satisfies Record<keyof BrowserAPI, ReturnType<typeof vi.fn>>;
}
