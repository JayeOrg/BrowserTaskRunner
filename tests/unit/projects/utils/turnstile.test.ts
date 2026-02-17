import { describe, it, expect, vi } from "vitest";
import { detectTurnstile, clickTurnstile } from "../../../../stack/projects/utils/turnstile.js";
import { createMockBrowser } from "../../../fixtures/mock-browser.js";

function mockTurnstileFound(browser: ReturnType<typeof createMockBrowser>) {
  vi.mocked(browser.querySelectorRect).mockResolvedValue({
    type: "querySelectorRect",
    found: true,
    selector: ".cf-turnstile",
    rect: { left: 100, top: 200, width: 300, height: 60 },
  });
}

describe("detectTurnstile", () => {
  it("returns click coordinates when found", async () => {
    const browser = createMockBrowser();
    mockTurnstileFound(browser);

    const result = await detectTurnstile(browser);
    expect(result).toEqual({
      found: true,
      selector: ".cf-turnstile",
      clickX: 130, // 100 + 30 (CHECKBOX_OFFSET_X)
      clickY: 230, // 200 + 60/2
    });
  });

  it("returns found:false when no selector matches", async () => {
    const browser = createMockBrowser();
    // Default mock returns found: false

    const result = await detectTurnstile(browser);
    expect(result).toEqual({ found: false });
  });
});

describe("clickTurnstile", () => {
  it("calls click with matched selector when found", async () => {
    const browser = createMockBrowser();
    mockTurnstileFound(browser);

    await clickTurnstile(browser);
    expect(browser.click).toHaveBeenCalledWith(".cf-turnstile");
  });

  it("does not call click when not found", async () => {
    const browser = createMockBrowser();

    await clickTurnstile(browser);
    expect(browser.click).not.toHaveBeenCalled();
  });

  it("returns detection result", async () => {
    const browser = createMockBrowser();
    mockTurnstileFound(browser);

    const result = await clickTurnstile(browser);
    expect(result.found).toBe(true);
  });
});
