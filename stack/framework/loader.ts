import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeNeeds, type TaskConfig } from "./tasks.js";

function projectsDir(): string {
  return resolve(import.meta.dirname, "../projects");
}

function isTaskConfig(value: unknown): value is TaskConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "mode" in value &&
    typeof value.mode === "string" &&
    (value.mode === "once" || value.mode === "retry") &&
    (value.mode !== "retry" || ("intervalMs" in value && typeof value.intervalMs === "number")) &&
    "run" in value &&
    typeof value.run === "function" &&
    "url" in value &&
    typeof value.url === "string" &&
    "project" in value &&
    typeof value.project === "string" &&
    "needs" in value
  );
}

function readTaskDir(base: string, projectName: string): string[] {
  const tasksPath = resolve(base, projectName, "tasks");
  try {
    return readdirSync(tasksPath);
  } catch {
    return [];
  }
}

function findTaskFile(name: string): string | null {
  const base = projectsDir();
  const target = `${name}.js`;
  let found: string | null = null;

  const projects = readdirSync(base, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );

  for (const entry of projects) {
    const files = readTaskDir(base, entry.name);

    if (files.includes(target)) {
      if (found !== null) {
        throw new Error(
          `Ambiguous task "${name}": found in multiple projects. ` +
            `Remove duplicates so each task name is unique.`,
        );
      }
      found = resolve(base, entry.name, "tasks", target);
    }
  }

  return found;
}

export async function loadTask(name: string): Promise<TaskConfig> {
  const filePath = findTaskFile(name);

  if (!filePath) {
    const available = listTaskNames();
    throw new Error(
      `No task file found for "${name}". ` +
        `Expected: projects/*/tasks/${name}.ts\n` +
        `Available tasks: ${available.join(", ")}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const mod: Record<string, unknown> = await import(filePath);

  if (!isTaskConfig(mod.task)) {
    throw new Error(
      `Task file "${filePath}" must export a valid TaskConfig as "task". ` +
        `Example: export const task: RetryingTask = { name: "${name}", ... }`,
    );
  }

  if (mod.task.name !== name) {
    throw new Error(
      `Task name mismatch in "${filePath}": ` +
        `task.name is "${mod.task.name}" but filename requires "${name}".`,
    );
  }

  return mod.task;
}

export function listTaskNames(): string[] {
  const base = projectsDir();
  const names: string[] = [];

  const projects = readdirSync(base, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );

  for (const entry of projects) {
    const files = readTaskDir(base, entry.name);
    for (const file of files) {
      if (file.endsWith(".js")) {
        names.push(file.replace(/\.js$/u, ""));
      }
    }
  }

  return names.sort((left, right) => left.localeCompare(right));
}

export async function getProjectNeeds(project: string): Promise<string[]> {
  const allNeeds = new Set<string>();

  for (const taskName of listTaskNames()) {
    const task = await loadTask(taskName);
    if (task.project === project) {
      const needs = normalizeNeeds(task.needs);
      for (const detailKey of Object.values(needs)) {
        allNeeds.add(detailKey);
      }
    }
  }

  return [...allNeeds].sort((left, right) => left.localeCompare(right));
}
