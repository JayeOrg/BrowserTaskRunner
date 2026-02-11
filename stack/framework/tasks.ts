import type { BrowserAPI } from "../browser/browser.js";
import type { ZodType } from "zod";
import type { TaskLogger } from "./logging.js";

export interface TaskResultSuccess {
  step: string;
  finalUrl?: string;
  context?: Record<string, unknown>;
}

export type TaskContext = Record<string, string>;

export type TaskRun = (
  browser: BrowserAPI,
  context: TaskContext,
  logger: TaskLogger,
) => Promise<TaskResultSuccess>;

/**
 * Maps local context keys to vault detail keys.
 * Array shorthand: `["email", "password"]` — key and vault detail name are the same.
 * Object form: `{ loginEmail: "email" }` — local key differs from vault detail name.
 */
export type TaskNeeds = string[] | Record<string, string>;

export function normalizeNeeds(needs: TaskNeeds): Record<string, string> {
  if (Array.isArray(needs)) {
    return Object.fromEntries(needs.map((key) => [key, key]));
  }
  return needs;
}

export interface SingleAttemptTask {
  name: string;
  url: string;
  project: string;
  needs: TaskNeeds;
  mode: "once";
  keepBrowserOpen?: boolean;
  contextSchema?: ZodType;
  run: TaskRun;
}

export interface RetryingTask {
  name: string;
  url: string;
  project: string;
  needs: TaskNeeds;
  mode: "retry";
  intervalMs: number;
  contextSchema?: ZodType;
  run: TaskRun;
}

export type TaskConfig = SingleAttemptTask | RetryingTask;

export function validateContext(task: TaskConfig, context: TaskContext): void {
  if (!task.contextSchema) return;

  const result = task.contextSchema.safeParse(context);
  if (!result.success) {
    throw new Error(`Context validation failed for "${task.name}": ${result.error.message}`);
  }
}
