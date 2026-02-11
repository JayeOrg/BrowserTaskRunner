import type { BrowserAPI } from "../../browser/browser.js";

export type SelectorResult = { found: true; selector: string } | { found: false; error?: string };

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
          throw new Error("not found");
        }
        return {
          found: true,
          selector: result.selector,
        } satisfies SelectorResult;
      }),
    );
  } catch {
    return { found: false };
  }
}

/**
 * Click the first matching selector from a list.
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
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${selector}: ${message}`);
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
  const found = await waitForFirst(browser, selectors, timeout);
  if (!found.found) {
    return found;
  }
  try {
    await browser.fill(found.selector, value);
    return found;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { found: false, error: `fill failed for ${found.selector}: ${message}` };
  }
}
