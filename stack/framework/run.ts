import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Browser } from "../browser/browser.js";
import {
  validateContext,
  normalizeNeeds,
  type TaskConfig,
  type TaskContext,
  type TaskResultSuccess,
  type RetryingTask,
  type SingleAttemptTask,
} from "./tasks.js";
import { loadTask, listTaskNames } from "./loader.js";
import { StepError, getErrorMessage } from "./errors.js";
import { createPrefixLogger, createTaskLogger } from "./logging.js";
import { parseToken } from "../vault/crypto.js";
import { openVaultReadOnly } from "../vault/core.js";
import { loadProjectDetails } from "../vault/ops/runtime.js";

const WS_PORT = parseInt(process.env.WS_PORT || "8765", 10);
if (!Number.isFinite(WS_PORT)) {
  throw new Error(`Invalid WS_PORT: "${process.env.WS_PORT ?? ""}". Must be a finite number.`);
}
const VAULT_PATH = process.env.VAULT_PATH || resolve(import.meta.dirname, "../../vault.db");
const logger = createPrefixLogger("Framework");

function getTaskName(): string {
  const taskName = process.argv[2];
  if (!taskName) {
    const available = listTaskNames().join(", ");
    throw new Error(
      `Missing task name. Usage: node run.js <taskName>\nAvailable tasks: ${available}`,
    );
  }
  return taskName;
}

function resolveToken(project: string): string {
  const envKey = `VAULT_TOKEN_${project.toUpperCase().replace(/-/gu, "_")}`;
  const token = process.env[envKey] ?? process.env.VAULT_TOKEN;
  if (!token) {
    throw new Error(
      `No vault token found. Set ${envKey} (or VAULT_TOKEN) in .env. ` +
        `Generate with: npm run vault -- project export ${project}`,
    );
  }
  return token;
}

function loadContext(task: TaskConfig): TaskContext {
  const token = resolveToken(task.project);

  const projectKey = parseToken(token);
  const db = openVaultReadOnly(VAULT_PATH);

  try {
    const context = loadProjectDetails(db, projectKey, task.project, normalizeNeeds(task.needs));
    const keys = Object.keys(context);
    logger.log("Loaded context from vault", {
      project: task.project,
      keys: keys.length > 0 ? keys.join(", ") : "(none)",
    });
    return context;
  } finally {
    db.close();
  }
}

function handleSuccess(taskName: string, result: TaskResultSuccess): void {
  logger.success("TASK SUCCESSFUL!", {
    step: result.step,
    ...(result.finalUrl ? { url: result.finalUrl } : {}),
  });

  const timestamp = new Date().toISOString();
  const logsDir = resolve(import.meta.dirname, "../../logs");
  mkdirSync(logsDir, { recursive: true });
  const alertFile = resolve(logsDir, `alert-${taskName}.txt`);
  const lines = [`Task: ${taskName}`, `Success: ${timestamp}`, `Step: ${result.step}`];
  if (result.finalUrl) {
    lines.push(`URL: ${result.finalUrl}`);
  }
  writeFileSync(alertFile, `${lines.join("\n")}\n`);
  logger.success("Alert written", { file: alertFile });
  process.stdout.write("\u0007"); // Bell character — triggers a system alert sound
  logger.success("ALERT: Task successful!");
}

async function runSingleAttempt(
  task: SingleAttemptTask,
  browser: Browser,
  context: TaskContext,
): Promise<void> {
  const taskLogger = createTaskLogger(task.name);
  const deps = { ...browser.stepRunnerDeps(), taskLogger };
  const result = await task.run(browser, context, deps);
  handleSuccess(task.name, result);
}

function parseIntervalMs(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    throw new Error(`Invalid SITE_CHECK_INTERVAL_MS: "${raw}". Must be a finite number >= 1000.`);
  }
  return parsed;
}

async function runWithRetry(
  task: RetryingTask,
  browser: Browser,
  context: TaskContext,
): Promise<void> {
  const intervalMs = parseIntervalMs(process.env.SITE_CHECK_INTERVAL_MS, task.intervalMs);
  let attempt = 0;

  while (true) {
    attempt++;
    logger.log(`Attempt ${attempt.toString()}`, { task: task.name });
    const taskLogger = createTaskLogger(task.name);
    const deps = { ...browser.stepRunnerDeps(), taskLogger };

    try {
      const result = await task.run(browser, context, deps);
      handleSuccess(task.name, result);
      return;
    } catch (error) {
      if (error instanceof StepError) {
        logger.warn("Not successful yet");
      } else {
        throw error;
      }
    }

    logger.log("Waiting before next attempt", {
      seconds: Math.round(intervalMs / 1000),
    });
    await setTimeout(intervalMs);
  }
}

function shouldKeepOpen(task: TaskConfig): boolean {
  return task.mode === "once" && task.keepBrowserOpen === true;
}

async function blockForever(): Promise<never> {
  logger.log("Browser kept open — container will stay alive until stopped");
  return new Promise(() => {
    /* Intentionally never resolves */
  });
}

async function runTask(task: TaskConfig, context: TaskContext): Promise<void> {
  const browser = new Browser(WS_PORT);
  const keepOpen = shouldKeepOpen(task);

  try {
    await browser.start();

    logger.log("Testing connection...");
    await browser.ping();
    logger.success("Extension connected and ready");

    switch (task.mode) {
      case "once":
        await runSingleAttempt(task, browser, context);
        break;
      case "retry":
        await runWithRetry(task, browser, context);
        break;
      default: {
        const exhaustive: never = task;
        throw new Error(`Unknown task mode: ${String(exhaustive)}`);
      }
    }

    if (keepOpen) {
      await blockForever();
    }
  } catch (error) {
    if (keepOpen) {
      logger.error("Task failed but browser kept open for inspection", {
        error: getErrorMessage(error),
      });
      await blockForever();
    }
    throw error;
  } finally {
    if (!keepOpen) {
      browser.close();
    }
  }
}

async function main(): Promise<void> {
  const taskName = getTaskName();
  const task = await loadTask(taskName);
  const context = loadContext(task);
  validateContext(task, context);

  logger.log("Running task", {
    task: task.name,
    url: task.displayUrl,
    mode: task.mode,
  });

  await runTask(task, context);
}

main().catch((error: unknown) => {
  if (!(error instanceof StepError)) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    logger.error("Fatal error", { error: detail });
  }
  process.exit(1);
});
