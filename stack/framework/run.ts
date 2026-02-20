import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Browser } from "../browser/browser.js";
import {
  validateSecrets,
  normalizeNeeds,
  type TaskConfig,
  type VaultSecrets,
  type RetryingTask,
  type SingleAttemptTask,
} from "./tasks.js";
import { loadTask, listTaskNames } from "./loader.js";
import { StepError, toErrorMessage } from "./errors.js";
import { ANSI_PATTERN, createPrefixLogger, createTaskLogger, type LogOutput } from "./logging.js";
import { parseProjectToken } from "../vault/crypto.js";
import { openVaultReadOnly } from "../vault/core.js";
import { loadProjectDetails } from "../vault/ops/runtime.js";

const WS_PORT = parseInt(process.env.WS_PORT || "8765", 10);
if (!Number.isFinite(WS_PORT)) {
  throw new Error(`Invalid WS_PORT: "${process.env.WS_PORT ?? ""}". Must be a finite number.`);
}
const VAULT_PATH = process.env.VAULT_PATH || resolve(import.meta.dirname, "../../vault.db");
const MIN_INTERVAL_MS = 1000;

const logsDir = resolve(import.meta.dirname, "../../logs");
mkdirSync(logsDir, { recursive: true });

// Mutable output — upgraded to file+console in main() once task name is known
let writeLog: LogOutput = (message) => {
  console.log(message);
};
const output: LogOutput = (message) => {
  writeLog(message);
};

const logger = createPrefixLogger("Framework", output);

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

function loadSecrets(task: TaskConfig): VaultSecrets {
  const token = resolveToken(task.project);

  const projectKey = parseProjectToken(token);
  const db = openVaultReadOnly(VAULT_PATH);

  try {
    const secrets = loadProjectDetails(db, projectKey, task.project, normalizeNeeds(task.needs));
    const keys = Object.keys(secrets);
    logger.log("Loaded secrets from vault", {
      project: task.project,
      vault: VAULT_PATH,
      keys: keys.length > 0 ? keys.join(", ") : "(none)",
    });
    return secrets;
  } finally {
    db.close();
  }
}

function handleSuccess(taskName: string, lastCompletedStep: string, finalUrl: string): void {
  logger.success("TASK SUCCESSFUL!", { step: lastCompletedStep, url: finalUrl });

  const timestamp = new Date().toISOString();
  const alertFile = resolve(logsDir, `alert-${taskName}.txt`);
  const lines = [
    `Task: ${taskName}`,
    `Success: ${timestamp}`,
    `Step: ${lastCompletedStep}`,
    `URL: ${finalUrl}`,
  ];
  writeFileSync(alertFile, `${lines.join("\n")}\n`);
  logger.success("Alert written", { file: alertFile });
  const BELL = "\u0007";
  process.stdout.write(BELL);
}

async function runSingleAttempt(
  task: SingleAttemptTask,
  browser: Browser,
  secrets: VaultSecrets,
): Promise<void> {
  const taskLogger = createTaskLogger(task.name, output);
  const deps = { ...browser.stepRunnerDeps(), taskLogger };
  const lastCompletedStep = await task.run(browser, secrets, deps);
  const { url: finalUrl } = await browser.getUrl();
  handleSuccess(task.name, lastCompletedStep, finalUrl);
}

function parseIntervalMs(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < MIN_INTERVAL_MS) {
    throw new Error(
      `Invalid SITE_CHECK_INTERVAL_MS: "${raw}". Must be a finite number >= ${String(MIN_INTERVAL_MS)}.`,
    );
  }
  return parsed;
}

async function runWithRetry(
  task: RetryingTask,
  browser: Browser,
  secrets: VaultSecrets,
): Promise<void> {
  const intervalMs = parseIntervalMs(process.env.SITE_CHECK_INTERVAL_MS, task.intervalMs);
  let attempt = 0;

  while (true) {
    attempt++;
    logger.log(`Attempt ${attempt.toString()}`, { task: task.name });
    // Fresh logger per attempt so step numbers reset to 1
    const taskLogger = createTaskLogger(task.name, output);
    const deps = { ...browser.stepRunnerDeps(), taskLogger };

    try {
      const lastCompletedStep = await task.run(browser, secrets, deps);
      const { url: finalUrl } = await browser.getUrl();
      handleSuccess(task.name, lastCompletedStep, finalUrl);
      return;
    } catch (error) {
      if (error instanceof StepError) {
        logger.warn("Not successful yet", { step: error.step, reason: error.reason });
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

async function runTask(task: TaskConfig, secrets: VaultSecrets): Promise<void> {
  const browser = new Browser(WS_PORT);
  const keepOpen = shouldKeepOpen(task);

  const shutdown = (): void => {
    browser.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await browser.start();

    switch (task.mode) {
      case "once":
        await runSingleAttempt(task, browser, secrets);
        break;
      case "retry":
        await runWithRetry(task, browser, secrets);
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
        error: toErrorMessage(error),
      });
      await blockForever();
    }
    throw error;
  } finally {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    if (!keepOpen) {
      browser.close();
    }
  }
}

async function main(): Promise<void> {
  const taskName = getTaskName();

  // Upgrade writeLog to tee both console and a per-task log file
  const logStream = createWriteStream(resolve(logsDir, `task-${taskName}.log`), { flags: "a" });
  writeLog = (message) => {
    console.log(message);
    logStream.write(`${message.replace(ANSI_PATTERN, "")}\n`);
  };

  const task = await loadTask(taskName);
  const secrets = loadSecrets(task);
  validateSecrets(task, secrets);

  logger.log("Running task", {
    task: task.name,
    url: task.displayUrl,
    mode: task.mode,
  });

  await runTask(task, secrets);
}

main().catch((error: unknown) => {
  if (!(error instanceof StepError)) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    logger.error("Fatal error", { error: detail });
  }
  process.exit(1);
});
