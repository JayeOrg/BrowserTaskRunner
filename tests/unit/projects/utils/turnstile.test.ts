import { describe, it, expect, vi } from "vitest";
import {
  detectTurnstile,
  detectAndClickTurnstile,
} from "../../../../stack/projects/utils/turnstile.js";
import { stubBrowserAPI } from "../../../fixtures/mock-browser.js";

function mockTurnstileFound(browser: ReturnType<typeof stubBrowserAPI>) {
  vi.mocked(browser.querySelectorRect).mockResolvedValue({
    type: "querySelectorRect",
    found: true,
    selector: ".cf-turnstile",
    rect: { left: 100, top: 200, width: 300, height: 60 },
  });
}

describe("detectTurnstile", () => {
  it("returns matched selector when found", async () => {
    const browser = stubBrowserAPI();
    mockTurnstileFound(browser);

    const result = await detectTurnstile(browser);
    expect(result).toEqual({
      found: true,
      selector: ".cf-turnstile",
    });
  });

  it("returns found:false when no selector matches", async () => {
    const browser = stubBrowserAPI();
    // Default mock returns found: false

    const result = await detectTurnstile(browser);
    expect(result).toEqual({ found: false });
  });
});

describe("detectAndClickTurnstile", () => {
  it("calls click with matched selector when found", async () => {
    const browser = stubBrowserAPI();
    mockTurnstileFound(browser);

    await detectAndClickTurnstile(browser);
    expect(browser.click).toHaveBeenCalledWith(".cf-turnstile");
  });

  it("does not call click when not found", async () => {
    const browser = stubBrowserAPI();

    await detectAndClickTurnstile(browser);
    expect(browser.click).not.toHaveBeenCalled();
  });

  it("returns detection result", async () => {
    const browser = stubBrowserAPI();
    mockTurnstileFound(browser);

    const result = await detectAndClickTurnstile(browser);
    expect(result.found).toBe(true);
  });
});
