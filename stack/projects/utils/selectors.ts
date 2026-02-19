import type { BrowserAPI } from "../../browser/browser.js";
import { toErrorMessage } from "../../framework/errors.js";

export type SelectorResult =
  | { found: true; selector: string }
  | { found: false; error: Array<{ selector: string; error: string }> };

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
    if (!(error instanceof AggregateError)) throw error;
    const detail = error.errors.map((inner: unknown, idx: number) => ({
      selector: selectors[idx] ?? "unknown",
      error: inner instanceof Error ? inner.message : String(inner),
    }));
    return { found: false, error: detail };
  }
}

// Sequential — DOM clicks have side effects, so we try one at a time.
export async function clickFirst(
  browser: BrowserAPI,
  selectors: readonly string[],
): Promise<SelectorResult> {
  const errors: Array<{ selector: string; error: string }> = [];
  for (const selector of selectors) {
    try {
      await browser.click(selector);
      return { found: true, selector };
    } catch (error) {
      errors.push({ selector, error: toErrorMessage(error) });
    }
  }
  return { found: false, error: errors };
}

// Common login selectors shared across tasks
export const LOGIN_SELECTORS = {
  email: ['input[type="email"]', 'input[name="email"]', "input#email"] as const,
  password: ['input[type="password"]', 'input[name="password"]', "input#password"] as const,
} as const;

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
    return {
      found: false,
      error: [{ selector: result.selector, error: `fill failed: ${toErrorMessage(error)}` }],
    };
  }
}
