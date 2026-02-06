/**
 * Cloudflare Turnstile detection and clicking utilities.
 * All knowledge of Turnstile structure lives here in the tasks layer.
 */
import type { Browser } from "../../browser/browser.js";

// Turnstile container selectors - tasks own this knowledge
const TURNSTILE_SELECTORS = [
  ".turnstile",
  ".cf-turnstile",
  "[data-turnstile-widget]",
  "#turnstile-wrapper",
  '[class*="turnstile"]',
];

// Click offset from left edge of container (where the checkbox typically is)
const CHECKBOX_OFFSET_X = 30;

export type TurnstileDetectionResult =
  | { found: true; selector: string; clickX: number; clickY: number }
  | { found: false };

/**
 * Detects Turnstile on the page and returns click coordinates if found.
 */
export async function detectTurnstile(browser: Browser): Promise<TurnstileDetectionResult> {
  const response = await browser.querySelectorRect(TURNSTILE_SELECTORS);

  if (response.found) {
    return {
      found: true,
      selector: response.selector,
      clickX: response.rect.left + CHECKBOX_OFFSET_X,
      clickY: response.rect.top + response.rect.height / 2,
    };
  }

  return { found: false };
}

/**
 * Detects and clicks Turnstile if present on the page.
 * Returns whether a Turnstile was found and clicked.
 */
export async function clickTurnstile(browser: Browser): Promise<TurnstileDetectionResult> {
  const detection = await detectTurnstile(browser);

  if (detection.found) {
    await browser.cdpClick(detection.clickX, detection.clickY);
  }

  return detection;
}
