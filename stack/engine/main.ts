import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../browser/main.js";
import {
  findTask,
  type TaskConfig,
  type TaskContext,
  type RetryingTask,
  type SingleAttemptTask,
} from "./tasks.js";
import { allTasks } from "./registry.js";
import {
  StepError,
  getErrorMessage,
  type TaskResultFailure,
} from "../common/errors.js";
import { createPrefixLogger } from "../common/logging.js";

const WS_PORT = parseInt(process.env.WS_PORT || "8765", 10);
const logger = createPrefixLogger("Engine");

function getTaskName(): string {
  const taskName = process.argv[2];
  if (!taskName) {
    const available = allTasks.map((task) => task.name).join(", ");
    throw new Error(
      `Missing task name. Usage: node main.js <taskName>\nAvailable tasks: ${available}`,
    );
  }
  return taskName;
}

function loadContext(): TaskContext {
  const context: TaskContext = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("SITE_") && value !== undefined) {
      context[key] = value;
    }
  }
  const keys = Object.keys(context);
  logger.log("Loaded context", {
    keys: keys.length > 0 ? keys.join(", ") : "(none)",
  });
  return context;
}

function validateContext(task: TaskConfig, context: TaskContext): void {
  if (!task.contextSchema) return;

  const result = task.contextSchema.safeParse(context);
  if (!result.success) {
    throw new Error(
      `Context validation failed for "${task.name}": ${result.error.message}`,
    );
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

function writeAlert(taskName: string): void {
  const timestamp = new Date().toISOString();
  mkdirSync("logs", { recursive: true });
  const alertFile = `logs/alert-${taskName}.txt`;
  const content = `Task: ${taskName}\nSuccess: ${timestamp}\n`;
  writeFileSync(alertFile, content);
  logger.success("Alert written", { file: alertFile });
  process.stdout.write("\u0007");
  logger.success("ALERT: Task successful!");
}

async function runSingleAttempt(
  task: SingleAttemptTask,
  browser: Browser,
  context: TaskContext,
): Promise<void> {
  await task.run(browser, context);
  logger.success("TASK SUCCESSFUL!");
  writeAlert(task.name);
}

async function runWithRetry(
  task: RetryingTask,
  browser: Browser,
  context: TaskContext,
): Promise<void> {
  const envInterval = context.SITE_CHECK_INTERVAL_MS;
  const intervalMs = envInterval ? parseInt(envInterval, 10) : task.intervalMs;
  let attempt = 0;

  while (true) {
    attempt++;
    logger.log(`Attempt ${attempt.toString()}`, { task: task.name });

    try {
      await task.run(browser, context);
      logger.success("TASK SUCCESSFUL!");
      writeAlert(task.name);
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
    } else {
      logger.error("Fatal error", { error: getErrorMessage(error) });
    }
    throw error;
  } finally {
    browser.close();
  }
}

async function main(): Promise<void> {
  const taskName = getTaskName();
  const task = findTask(taskName, allTasks);
  const context = loadContext();

  validateContext(task, context);

  logger.log("Running task", {
    task: task.name,
    url: task.url,
    mode: task.mode,
  });

  await runTask(task, context);
}

main().catch((error: unknown) => {
  logger.error("Fatal error", { error: getErrorMessage(error) });
  process.exit(1);
});
