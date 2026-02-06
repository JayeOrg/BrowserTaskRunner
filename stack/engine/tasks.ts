import type { Browser } from "../browser/main.js";
import type { TaskResultSuccess } from "../common/errors.js";
import type { ZodType } from "zod";

export type TaskContext = Record<string, string>;

export interface SingleAttemptTask {
  name: string;
  url: string;
  mode: "once";
  contextSchema?: ZodType;
  run: (browser: Browser, context: TaskContext) => Promise<TaskResultSuccess>;
}

export interface RetryingTask {
  name: string;
  url: string;
  mode: "retry";
  intervalMs: number;
  contextSchema?: ZodType;
  run: (browser: Browser, context: TaskContext) => Promise<TaskResultSuccess>;
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
