import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dumpHtml } from "../../../../stack/projects/utils/dump.js";
import { stubBrowserAPI } from "../../../fixtures/mock-browser.js";
import { noopLogger } from "../../../fixtures/test-helpers.js";

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe("dumpHtml", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:30:45.123Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes page content to logs/ dir with label and timestamp", async () => {
    const browser = stubBrowserAPI();
    vi.mocked(browser.getContent).mockResolvedValue({
      type: "getContent",
      kind: "page",
      content: "<html><body>Hello</body></html>",
    });

    const path = await dumpHtml(browser, noopLogger.scoped("dumpHtml"), "after-login");

    expect(path).toMatch(/logs\/dump-after-login-2025-01-15T12-30-45-123Z\.html$/u);
    expect(browser.getContent).toHaveBeenCalledWith({ html: true });

    const { writeFile } = await import("node:fs/promises");
    expect(writeFile).toHaveBeenCalledWith(path, "<html><body>Hello</body></html>", "utf-8");
  });

  it("writes empty string when getContent returns notFound", async () => {
    const browser = stubBrowserAPI();
    vi.mocked(browser.getContent).mockResolvedValue({
      type: "getContent",
      kind: "notFound",
      content: "",
    });

    const path = await dumpHtml(browser, noopLogger.scoped("dumpHtml"), "missing");

    const { writeFile } = await import("node:fs/promises");
    expect(writeFile).toHaveBeenCalledWith(path, "", "utf-8");
  });

  it("writes empty string when getContent returns error", async () => {
    const browser = stubBrowserAPI();
    vi.mocked(browser.getContent).mockResolvedValue({
      type: "getContent",
      kind: "error",
      content: "",
    });

    const path = await dumpHtml(browser, noopLogger.scoped("dumpHtml"), "err");

    const { writeFile } = await import("node:fs/promises");
    expect(writeFile).toHaveBeenCalledWith(path, "", "utf-8");
  });
});
