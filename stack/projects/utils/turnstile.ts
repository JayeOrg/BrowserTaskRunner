import type { BrowserAPI } from "../../browser/browser.js";

const TURNSTILE_SELECTORS = [
  ".turnstile",
  ".cf-turnstile",
  "[data-turnstile-widget]",
  "#turnstile-wrapper",
  '[class*="turnstile"]',
];

export type TurnstileDetectionResult = { found: true; selector: string } | { found: false };

/**
 * Detects Turnstile on the page and returns the matched selector if found.
 */
export async function detectTurnstile(browser: BrowserAPI): Promise<TurnstileDetectionResult> {
  const response = await browser.querySelectorRect(TURNSTILE_SELECTORS);

  if (response.found) {
    return { found: true, selector: response.selector };
  }

  return { found: false };
}

/**
 * Detects and clicks Turnstile if present on the page.
 * Returns whether a Turnstile was found and clicked.
 */
export async function clickTurnstile(browser: BrowserAPI): Promise<TurnstileDetectionResult> {
  const detection = await detectTurnstile(browser);

  if (detection.found) {
    await browser.click(detection.selector);
  }

  return detection;
}
