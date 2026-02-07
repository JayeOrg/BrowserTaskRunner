import { vi } from "vitest";
import type { BrowserAPI } from "../../../../stack/browser/browser.js";

/**
 * Creates a mock BrowserAPI with all methods stubbed via vi.fn().
 * Each method returns a sensible default response matching the real types.
 */
export function createMockBrowser(): BrowserAPI {
  return {
    navigate: vi.fn().mockResolvedValue({ type: "navigate", url: "", title: "" }),
    getUrl: vi.fn().mockResolvedValue({ type: "getUrl", url: "", title: "" }),
    fill: vi.fn().mockResolvedValue({ type: "fill", success: true }),
    click: vi.fn().mockResolvedValue({ type: "click", success: true }),
    cdpClick: vi.fn().mockResolvedValue({ type: "cdpClick", success: true }),
    waitForSelector: vi.fn().mockResolvedValue({ type: "waitForSelector", found: false }),
    getContent: vi.fn().mockResolvedValue({ type: "getContent", content: "" }),
    querySelectorRect: vi.fn().mockResolvedValue({ type: "querySelectorRect", found: false }),
    ping: vi.fn().mockResolvedValue({ type: "ping", pong: true }),
    close: vi.fn(),
  };
}
