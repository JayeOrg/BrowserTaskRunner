import type { BrowserAPI } from "../../browser/browser.js";

const TURNSTILE_SELECTORS = [
  ".turnstile",
  ".cf-turnstile",
  "[data-turnstile-widget]",
  "#turnstile-wrapper",
  '[class*="turnstile"]',
];

export type TurnstileDetectionResult = { found: true; selector: string } | { found: false };

export async function detectTurnstile(browser: BrowserAPI): Promise<TurnstileDetectionResult> {
  const response = await browser.querySelectorRect(TURNSTILE_SELECTORS);

  if (response.found) {
    return { found: true, selector: response.selector };
  }

  return { found: false };
}

export async function detectAndClickTurnstile(
  browser: BrowserAPI,
): Promise<TurnstileDetectionResult> {
  const detection = await detectTurnstile(browser);

  if (detection.found) {
    await browser.click(detection.selector);
  }

  return detection;
}
