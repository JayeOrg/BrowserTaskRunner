import { describe, it, expect, vi } from "vitest";
import { waitForFirst, clickFirst, fillFirst } from "../../../../stack/tasks/utils/selectors.js";
import { createMockBrowser } from "./testing.js";

describe("waitForFirst", () => {
  it("returns first matching selector", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.waitForSelector).mockImplementation(async (selector) => {
      if (selector === ".match") {
        return { type: "waitForSelector", found: true, selector: ".match" };
      }
      // Simulate timeout by never resolving for non-matching selectors
      return new Promise(() => {});
    });

    const result = await waitForFirst(browser, [".nope", ".match"], 5000);
    expect(result).toEqual({ found: true, selector: ".match" });
  });

  it("returns found:false when all selectors timeout", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.waitForSelector).mockResolvedValue({
      type: "waitForSelector",
      found: false,
    });

    const result = await waitForFirst(browser, [".a", ".b"], 100);
    expect(result).toEqual({ found: false });
  });
});

describe("clickFirst", () => {
  it("returns first successfully clicked selector", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.click)
      .mockResolvedValueOnce({ type: "click", success: false, error: "not found" })
      .mockResolvedValueOnce({ type: "click", success: true });

    const result = await clickFirst(browser, [".a", ".b"]);
    expect(result).toEqual({ found: true, selector: ".b" });
  });

  it("returns error when none succeed", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.click)
      .mockResolvedValueOnce({ type: "click", success: false, error: "nope1" })
      .mockResolvedValueOnce({ type: "click", success: false, error: "nope2" });

    const result = await clickFirst(browser, [".a", ".b"]);
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.error).toContain(".a:");
      expect(result.error).toContain(".b:");
    }
  });

  it("catches thrown errors and continues", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.click)
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ type: "click", success: true });

    const result = await clickFirst(browser, [".a", ".b"]);
    expect(result).toEqual({ found: true, selector: ".b" });
  });

  it("handles non-Error thrown values", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.click).mockRejectedValueOnce("string rejection");

    const result = await clickFirst(browser, [".a"]);
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.error).toContain("string rejection");
    }
  });
});

describe("fillFirst", () => {
  it("waits for selector then fills", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.waitForSelector).mockResolvedValue({
      type: "waitForSelector",
      found: true,
      selector: "#email",
    });
    vi.mocked(browser.fill).mockResolvedValue({ type: "fill", success: true });

    const result = await fillFirst(browser, ["#email"], "test@example.com", 5000);
    expect(result).toEqual({ found: true, selector: "#email" });
    expect(browser.fill).toHaveBeenCalledWith("#email", "test@example.com");
  });

  it("returns found:false when no selector found", async () => {
    const browser = createMockBrowser();

    const result = await fillFirst(browser, [".x"], "val", 100);
    expect(result.found).toBe(false);
  });

  it("returns error when fill fails after finding selector", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.waitForSelector).mockResolvedValue({
      type: "waitForSelector",
      found: true,
      selector: "#input",
    });
    vi.mocked(browser.fill).mockResolvedValue({
      type: "fill",
      success: false,
      error: "element detached",
    });

    const result = await fillFirst(browser, ["#input"], "val", 5000);
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.error).toContain("#input");
    }
  });
});
