import type { BrowserAPI } from "../browser/browser.js";
import type { ZodType } from "zod";

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
  contextSchema?: ZodType;
  run: (browser: BrowserAPI, context: TaskContext) => Promise<TaskResultSuccess>;
}

export interface RetryingTask {
  name: string;
  url: string;
  project: string;
  needs: Record<string, string>;
  mode: "retry";
  intervalMs: number;
  contextSchema?: ZodType;
  run: (browser: BrowserAPI, context: TaskContext) => Promise<TaskResultSuccess>;
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
