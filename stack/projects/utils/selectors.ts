import type { BrowserAPI } from "../../browser/browser.js";
import { getErrorMessage } from "../../framework/errors.js";

export type SelectorResult = { found: true; selector: string } | { found: false; error: string };

/**
 * Race all selectors concurrently within a single timeout window.
 * Returns the first selector that matches, or found: false if none matched.
 */
export async function waitForFirst(
  browser: BrowserAPI,
  selectors: readonly string[],
  timeout: number,
): Promise<SelectorResult> {
  try {
    return await Promise.any(
      selectors.map(async (selector) => {
        const result = await browser.waitForSelector(selector, timeout);
        if (!result.found) {
          throw new Error(`not found: ${selector}`);
        }
        return {
          found: true,
          selector: result.selector,
        } satisfies SelectorResult;
      }),
    );
  } catch (error) {
    if (error instanceof AggregateError) {
      const detail = error.errors
        .map((inner: unknown) => (inner instanceof Error ? inner.message : String(inner)))
        .join("; ");
      return { found: false, error: detail };
    }
    return { found: false, error: getErrorMessage(error) };
  }
}

/**
 * Click the first matching selector from a list.
 * Uses sequential iteration rather than racing concurrently because DOM clicks
 * have side effects — we try one at a time so we don't trigger multiple clicks.
 * Returns the selector that was clicked, or error if none found.
 */
export async function clickFirst(
  browser: BrowserAPI,
  selectors: readonly string[],
): Promise<SelectorResult> {
  const errors: string[] = [];
  for (const selector of selectors) {
    try {
      await browser.click(selector);
      return { found: true, selector };
    } catch (error) {
      errors.push(`${selector}: ${getErrorMessage(error)}`);
    }
  }
  return { found: false, error: errors.join("; ") };
}

/**
 * Fill the first matching selector from a list.
 * Races all selectors concurrently (via waitForFirst), then fills the winner.
 */
export async function fillFirst(
  browser: BrowserAPI,
  selectors: readonly string[],
  value: string,
  timeout: number,
): Promise<SelectorResult> {
  const result = await waitForFirst(browser, selectors, timeout);
  if (!result.found) {
    return result;
  }
  try {
    await browser.fill(result.selector, value);
    return result;
  } catch (error) {
    return { found: false, error: `fill failed for ${result.selector}: ${getErrorMessage(error)}` };
  }
}
