import type { ExtensionHost } from "../host/main.js";
import type { TaskResultSuccess } from "../common/errors.js";
import { botcLoginTask } from "../tasks/botc.js";

export type TaskContext = Record<string, string>;

export interface TaskConfig {
  name: string;
  url: string;
  run: (
    host: ExtensionHost,
    context: TaskContext,
  ) => Promise<TaskResultSuccess>;
}

const tasks: Record<string, TaskConfig> = {
  botcLogin: botcLoginTask,
};

export function getTask(name: string): TaskConfig {
  const task = tasks[name];
  if (!task) {
    const available = Object.keys(tasks).join(", ");
    throw new Error(`Unknown task: "${name}". Available tasks: ${available}`);
  }
  return task;
}

export function listTasks(): string[] {
  return Object.keys(tasks);
}
