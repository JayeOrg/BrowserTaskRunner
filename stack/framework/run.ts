import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Browser } from "../browser/browser.js";
import {
  findTask,
  validateContext,
  type TaskConfig,
  type TaskContext,
  type TaskResultSuccess,
  type RetryingTask,
  type SingleAttemptTask,
} from "./tasks.js";
import { allTasks } from "./registry.js";
import { StepError, getErrorMessage, type TaskResultFailure } from "./errors.js";
import { createPrefixLogger, createTaskLogger } from "./logging.js";
import { parseToken } from "../vault/crypto.js";
import { openVaultReadOnly } from "../vault/core.js";
import { loadProjectDetails } from "../vault/ops/runtime.js";

const WS_PORT = parseInt(process.env.WS_PORT || "8765", 10);
const VAULT_PATH = process.env.VAULT_PATH || resolve(import.meta.dirname, "../../vault.db");
const logger = createPrefixLogger("Framework");

function getTaskName(): string {
  const taskName = process.argv[2];
  if (!taskName) {
    const available = allTasks.map((task) => task.name).join(", ");
    throw new Error(
      `Missing task name. Usage: node run.js <taskName>\nAvailable tasks: ${available}`,
    );
  }
  return taskName;
}

function loadContext(task: TaskConfig): TaskContext {
  const token = process.env.VAULT_TOKEN;
  if (!token) {
    throw new Error(
      "VAULT_TOKEN environment variable is required. Export a project token from the vault.",
    );
  }

  const projectKey = parseToken(token);
  const db = openVaultReadOnly(VAULT_PATH);

  try {
    const context = loadProjectDetails(db, projectKey, task.project, task.needs);
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

function logFailureDetails(result: TaskResultFailure): void {
  logger.warn("Failure", {
    reason: result.reason,
    step: result.step,
    ...(result.finalUrl ? { url: result.finalUrl } : {}),
    ...(result.details ? { details: result.details } : {}),
    ...(result.context ? { context: result.context } : {}),
  });
}

function writeAlert(taskName: string, result: TaskResultSuccess): void {
  const timestamp = new Date().toISOString();
  mkdirSync("logs", { recursive: true });
  const alertFile = `logs/alert-${taskName}.txt`;
  const lines = [`Task: ${taskName}`, `Success: ${timestamp}`, `Step: ${result.step}`];
  if (result.finalUrl) {
    lines.push(`URL: ${result.finalUrl}`);
  }
  writeFileSync(alertFile, `${lines.join("\n")}\n`);
  logger.success("Alert written", { file: alertFile });
  process.stdout.write("\u0007");
  logger.success("ALERT: Task successful!");
}

async function runSingleAttempt(
  task: SingleAttemptTask,
  browser: Browser,
  context: TaskContext,
): Promise<void> {
  const taskLogger = createTaskLogger(task.name);
  const result = await task.run(browser, context, taskLogger);
  logger.success("TASK SUCCESSFUL!", {
    step: result.step,
    ...(result.finalUrl ? { url: result.finalUrl } : {}),
  });
  writeAlert(task.name, result);
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
  const intervalMs = parseIntervalMs(context.SITE_CHECK_INTERVAL_MS, task.intervalMs);
  const taskLogger = createTaskLogger(task.name);
  let attempt = 0;

  while (true) {
    attempt++;
    logger.log(`Attempt ${attempt.toString()}`, { task: task.name });

    try {
      const result = await task.run(browser, context, taskLogger);
      logger.success("TASK SUCCESSFUL!", {
        step: result.step,
        ...(result.finalUrl ? { url: result.finalUrl } : {}),
      });
      writeAlert(task.name, result);
      return;
    } catch (error) {
      if (error instanceof StepError) {
        logFailureDetails(error.toResult());
        logger.warn("Not successful yet");
      } else {
        logger.warn(`Unexpected: ${getErrorMessage(error)}`);
      }
    }

    logger.log("Waiting before next attempt", {
      seconds: Math.round(intervalMs / 1000),
    });
    await setTimeout(intervalMs);
  }
}

async function runTask(task: TaskConfig, context: TaskContext): Promise<void> {
  const browser = new Browser(WS_PORT);

  try {
    await browser.start();

    logger.log("Testing connection...");
    await browser.ping();
    logger.success("Extension connected and ready");

    if (task.mode === "once") {
      await runSingleAttempt(task, browser, context);
    } else {
      await runWithRetry(task, browser, context);
    }
  } catch (error) {
    if (error instanceof StepError) {
      logFailureDetails(error.toResult());
    }
    throw error;
  } finally {
    browser.close();
  }
}

async function main(): Promise<void> {
  const taskName = getTaskName();
  const task = findTask(taskName, allTasks);
  const context = loadContext(task);
  validateContext(task, context);

  logger.log("Running task", {
    task: task.name,
    url: task.url,
    mode: task.mode,
  });

  await runTask(task, context);
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  logger.error("Fatal error", { error: detail });
  process.exit(1);
});
