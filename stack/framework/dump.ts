import { execFile } from "node:child_process";
import { readdir, unlink, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BrowserAPI } from "../browser/browser.js";
import { LOGS_DIR } from "./paths.js";

interface DumpLogger {
  log: (msg: string, data?: Record<string, unknown>) => void;
}

const execFileAsync = promisify(execFile);
const MAX_KEPT = 3;

async function keepLatest(prefix: string, extension: string): Promise<void> {
  const files = await readdir(LOGS_DIR);
  const matching = files
    .filter((name) => name.startsWith(prefix) && name.endsWith(extension))
    .sort((left, right) => left.localeCompare(right));

  const toRemove = matching.slice(0, -MAX_KEPT);
  await Promise.all(toRemove.map((name) => unlink(join(LOGS_DIR, name))));
}

// In Docker, logs/ is a mounted volume — dumps are accessible on the host.
export async function dumpHtml(
  browser: BrowserAPI,
  logger: DumpLogger,
  label: string,
): Promise<string> {
  await mkdir(LOGS_DIR, { recursive: true });
  const result = await browser.getContent({ html: true });
  const content = result.kind === "notFound" || result.kind === "error" ? "" : result.content;
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const path = join(LOGS_DIR, `dump-${label}-${timestamp}.html`);
  await writeFile(path, content, "utf-8");
  logger.log(`Wrote ${String(content.length)} chars to ${path}`);
  await keepLatest(`dump-${label}-`, ".html");
  return path;
}

export async function dumpScreenshot(logger: DumpLogger, label: string): Promise<string> {
  await mkdir(LOGS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const path = join(LOGS_DIR, `screenshot-${label}-${timestamp}.png`);
  await execFileAsync("scrot", [path]);
  logger.log(`Screenshot saved to ${path}`);
  await keepLatest(`screenshot-${label}-`, ".png");
  return path;
}
