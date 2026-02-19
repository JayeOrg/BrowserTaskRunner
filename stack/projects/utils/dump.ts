import { resolve } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import type { BrowserAPI } from "../../browser/browser.js";
import type { StepLogger } from "../../framework/logging.js";

const LOGS_DIR = resolve(import.meta.dirname, "../../../logs");

// In Docker, logs/ is a mounted volume — dumps are accessible on the host.
export async function dumpHtml(
  browser: BrowserAPI,
  logger: StepLogger,
  label: string,
): Promise<string> {
  await mkdir(LOGS_DIR, { recursive: true });
  const result = await browser.getContent({ html: true });
  const content = result.kind === "notFound" || result.kind === "error" ? "" : result.content;
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const path = resolve(LOGS_DIR, `dump-${label}-${timestamp}.html`);
  await writeFile(path, content, "utf-8");
  logger.log(`Wrote ${String(content.length)} chars to ${path}`);
  return path;
}
