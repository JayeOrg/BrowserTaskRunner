/**
 * Selector utilities for behavior layer.
 * These provide "try multiple selectors" patterns without adding
 * site-specific knowledge to the extension.
 */
import type { ExtensionHost } from '../../extension/host.js';

export interface SelectorResult {
  found: boolean;
  selector?: string;
  error?: string;
}

/**
 * Wait for the first matching selector from a list.
 * Returns the selector that matched, or found: false if none matched.
 */
export async function waitForFirst(
  host: ExtensionHost,
  selectors: readonly string[],
  timeout: number
): Promise<SelectorResult> {
  for (const selector of selectors) {
    const result = await host.waitForSelector(selector, timeout);
    if (result.found) {
      return { found: true, selector };
    }
  }
  return { found: false };
}

/**
 * Click the first matching selector from a list.
 * Returns the selector that was clicked, or error if none found.
 */
export async function clickFirst(
  host: ExtensionHost,
  selectors: readonly string[]
): Promise<SelectorResult> {
  const errors: string[] = [];
  for (const selector of selectors) {
    try {
      const result = await host.click(selector);
      if (!result.error) {
        return { found: true, selector };
      }
      errors.push(`${selector}: ${result.error}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${selector}: ${message}`);
    }
  }
  return { found: false, error: errors.join('; ') };
}

/**
 * Fill the first matching selector from a list.
 * Returns the selector that was filled, or error if none found.
 */
export async function fillFirst(
  host: ExtensionHost,
  selectors: readonly string[],
  value: string,
  timeout: number
): Promise<SelectorResult> {
  for (const selector of selectors) {
    const waitResult = await host.waitForSelector(selector, timeout);
    if (waitResult.found) {
      const fillResult = await host.fill(selector, value);
      if (!fillResult.error) {
        return { found: true, selector };
      }
    }
  }
  return { found: false };
}
