import type { BrowserAPI } from "../browser/browser.js";
import type { ZodType } from "zod";
import type { TaskLogger } from "./logging.js";

export interface TaskResultSuccess {
  ok: true;
  step: string;
  finalUrl?: string;
  context?: Record<string, unknown>;
}

export type TaskContext = Record<string, string>;

export interface SingleAttemptTask {
  name: string;
  url: string;
  project: string;
  needs: Record<string, string>;
  mode: "once";
  keepBrowserOpen?: boolean;
  contextSchema?: ZodType;
  run: (
    browser: BrowserAPI,
    context: TaskContext,
    logger: TaskLogger,
  ) => Promise<TaskResultSuccess>;
}

export interface RetryingTask {
  name: string;
  url: string;
  project: string;
  needs: Record<string, string>;
  mode: "retry";
  intervalMs: number;
  contextSchema?: ZodType;
  run: (
    browser: BrowserAPI,
    context: TaskContext,
    logger: TaskLogger,
  ) => Promise<TaskResultSuccess>;
}

export type TaskConfig = SingleAttemptTask | RetryingTask;

export function findTask(name: string, tasks: TaskConfig[]): TaskConfig {
  const task = tasks.find((entry) => entry.name === name);
  if (!task) {
    const available = tasks.map((entry) => entry.name).join(", ");
    throw new Error(`Unknown task: "${name}". Available: ${available}`);
  }
  return task;
}

export function validateContext(task: TaskConfig, context: TaskContext): void {
  if (!task.contextSchema) return;

  const result = task.contextSchema.safeParse(context);
  if (!result.success) {
    throw new Error(`Context validation failed for "${task.name}": ${result.error.message}`);
  }
}

export async function executeRetry(
  task: RetryingTask,
  browser: BrowserAPI,
  context: TaskContext,
  logger: TaskLogger,
  delay: (ms: number) => Promise<void>,
): Promise<TaskResultSuccess> {
  while (true) {
    try {
      return await task.run(browser, context, logger);
    } catch {
      await delay(task.intervalMs);
    }
  }
}
