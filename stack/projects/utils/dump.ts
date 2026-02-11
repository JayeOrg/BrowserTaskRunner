import { writeFileSync } from "node:fs";
import type { BrowserAPI } from "../../browser/browser.js";
import type { TaskLogger } from "../../framework/logging.js";

/**
 * Dump the current page HTML to /tmp for debugging.
 * Drop into any task with a one-liner:
 *
 *   import { dumpHtml } from "../../utils/dump.js";
 *
 * Then call anywhere:
 *
 *   await dumpHtml(browser, logger, "after-login");
 */
export async function dumpHtml(
  browser: BrowserAPI,
  logger: TaskLogger,
  label: string,
): Promise<string> {
  const { content } = await browser.getContent(undefined, { html: true });
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const path = `/tmp/sitecheck-dump-${label}-${timestamp}.html`;
  writeFileSync(path, content, "utf-8");
  logger.log("dumpHtml", `Wrote ${String(content.length)} chars to ${path}`);
  return path;
}
