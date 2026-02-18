import { describe, it, expect, vi } from "vitest";
import { waitForFirst, clickFirst, fillFirst } from "../../../../stack/projects/utils/selectors.js";
import { createMockBrowser } from "../../../fixtures/mock-browser.js";

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
    expect(result.found).toBe(false);
    expect(result).toHaveProperty("error");
  });
});

describe("clickFirst", () => {
  it("returns first successfully clicked selector", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.click)
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce({ type: "click" });

    const result = await clickFirst(browser, [".a", ".b"]);
    expect(result).toEqual({ found: true, selector: ".b" });
  });

  it("returns error when none succeed", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.click)
      .mockRejectedValueOnce(new Error("nope1"))
      .mockRejectedValueOnce(new Error("nope2"));

    const result = await clickFirst(browser, [".a", ".b"]);
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.error).toHaveLength(2);
      expect(result.error[0]?.selector).toBe(".a");
      expect(result.error[0]?.error).toContain("nope1");
      expect(result.error[1]?.selector).toBe(".b");
      expect(result.error[1]?.error).toContain("nope2");
    }
  });

  it("catches thrown errors and continues", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.click)
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ type: "click" });

    const result = await clickFirst(browser, [".a", ".b"]);
    expect(result).toEqual({ found: true, selector: ".b" });
  });

  it("handles non-Error thrown values", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.click).mockRejectedValueOnce("string rejection");

    const result = await clickFirst(browser, [".a"]);
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.error).toHaveLength(1);
      expect(result.error[0]?.selector).toBe(".a");
      expect(result.error[0]?.error).toContain("string rejection");
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
    vi.mocked(browser.fill).mockResolvedValue({ type: "fill" });

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
    vi.mocked(browser.fill).mockRejectedValue(new Error("element detached"));

    const result = await fillFirst(browser, ["#input"], "val", 5000);
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.error).toHaveLength(1);
      expect(result.error[0]?.selector).toBe("#input");
      expect(result.error[0]?.error).toContain("element detached");
    }
  });

  it("handles non-Error thrown values from fill", async () => {
    const browser = createMockBrowser();
    vi.mocked(browser.waitForSelector).mockResolvedValue({
      type: "waitForSelector",
      found: true,
      selector: "#input",
    });
    vi.mocked(browser.fill).mockRejectedValue("string rejection");

    const result = await fillFirst(browser, ["#input"], "val", 5000);
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.error).toHaveLength(1);
      expect(result.error[0]?.selector).toBe("#input");
      expect(result.error[0]?.error).toContain("string rejection");
    }
  });
});
