import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { ExtensionHost } from "../host/main.js";
import {
  getTask,
  listTasks,
  type TaskContext,
  type TaskConfig,
} from "./tasks.js";
import {
  StepError,
  getErrorMessage,
  type TaskResultFailure,
} from "../common/errors.js";
import { createPrefixLogger } from "../common/logging.js";

const WS_PORT = parseInt(process.env.WS_PORT || "8765", 10);
const logger = createPrefixLogger("Runner");

function getTaskName(): string {
  const taskName = process.argv[2];
  if (!taskName) {
    const available = listTasks().join(", ");
    throw new Error(
      `Missing task name. Usage: node main.js <taskName>\nAvailable tasks: ${available}`,
    );
  }
  return taskName;
}

// Load all SITE_* env vars as task context
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

async function runTask(task: TaskConfig, context: TaskContext): Promise<void> {
  const host = new ExtensionHost(WS_PORT);

  try {
    await host.start();

    logger.log("Testing connection...");
    await host.ping();
    logger.success("Extension connected and ready");

    await task.run(host, context);
    logger.success("TASK SUCCESSFUL!");
    writeAlert(task.name);
  } catch (error) {
    if (error instanceof StepError) {
      logFailureDetails(error.toResult());
    } else {
      logger.error("Fatal error", { error: getErrorMessage(error) });
    }
    throw error;
  } finally {
    host.close();
  }
}

async function main(): Promise<void> {
  const taskName = getTaskName();
  const task = getTask(taskName);
  const context = loadContext();

  logger.log("Running task", { task: task.name, url: task.url });

  await runTask(task, context);
}

main().catch((error: unknown) => {
  logger.error("Fatal error", { error: getErrorMessage(error) });
  process.exit(1);
});
