import type { BrowserAPI } from "../browser/browser.js";
import { z, type ZodType } from "zod";
import type { StepRunnerDeps } from "./step-runner.js";

export interface TaskResultSuccess {
  step: string;
  finalUrl?: string;
  context?: Record<string, unknown>;
}

export type VaultSecrets = Record<string, string>;

export type TaskRun = (
  browser: BrowserAPI,
  context: VaultSecrets,
  deps: StepRunnerDeps,
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

/**
 * Derives a `needs` mapping from a zod schema's top-level keys.
 * Use when the local context keys match vault detail names 1:1.
 *
 * ```ts
 * needs: needsFromSchema(contextSchema),
 * ```
 */
export function needsFromSchema(schema: ZodType): Record<string, string> {
  if (schema instanceof z.ZodObject) {
    const shape: Record<string, unknown> = schema.shape;
    return Object.fromEntries(Object.keys(shape).map((key) => [key, key]));
  }
  return {};
}

interface BaseTask {
  name: string;
  /** Starting URL — informational metadata logged on task start, not used by the runner. */
  displayUrl: string;
  project: string;
  needs: TaskNeeds;
  contextSchema?: ZodType;
  run: TaskRun;
}

export interface SingleAttemptTask extends BaseTask {
  mode: "once";
  keepBrowserOpen?: boolean;
}

export interface RetryingTask extends BaseTask {
  mode: "retry";
  /** Retry interval in milliseconds. */
  intervalMs: number;
}

export type TaskConfig = SingleAttemptTask | RetryingTask;

export function validateContext(task: TaskConfig, context: VaultSecrets): void {
  if (!task.contextSchema) return;

  const result = task.contextSchema.safeParse(context);
  if (!result.success) {
    throw new Error(`Context validation failed for "${task.name}": ${result.error.message}`);
  }
}
