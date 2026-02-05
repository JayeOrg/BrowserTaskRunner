import { TaskConfig } from './types.js';
import { botcLoginTask } from './sites/botc.js';

const tasks: Record<string, TaskConfig> = {
  botcLogin: botcLoginTask,
};

export function getTask(name: string): TaskConfig {
  const task = tasks[name];
  if (!task) {
    const available = Object.keys(tasks).join(', ');
    throw new Error(`Unknown task: "${name}". Available tasks: ${available}`);
  }
  return task;
}

export function listTasks(): string[] {
  return Object.keys(tasks);
}
