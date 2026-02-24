import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { normalizeNeeds, taskConfigSchema, type TaskConfig } from "./tasks.js";
import type { ProjectConfig } from "./project.js";
import { PROJECTS_DIR } from "./paths.js";

export function isTaskConfig(value: unknown): value is TaskConfig {
  return taskConfigSchema.safeParse(value).success;
}

function isProjectConfig(value: unknown): value is ProjectConfig {
  if (typeof value !== "object" || value === null) return false;
  if (!("name" in value) || typeof value.name !== "string") return false;
  if (!("tasks" in value) || !Array.isArray(value.tasks)) return false;
  return value.tasks.every((item: unknown) => isTaskConfig(item));
}

export function validateProjectModule(
  mod: Record<string, unknown>,
  projectDir: string,
): ProjectConfig {
  if (!isProjectConfig(mod.project)) {
    throw new Error(
      `Project file "projects/${projectDir}/project.ts" must export a valid ProjectConfig as "project".`,
    );
  }
  return mod.project;
}

function listProjectDirs(): string[] {
  return readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

async function loadProjectModule(projectDir: string): Promise<ProjectConfig | null> {
  const projectFile = join(PROJECTS_DIR, projectDir, "project.js");
  if (!existsSync(projectFile)) return null;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic import
  const mod: Record<string, unknown> = await import(projectFile);
  return validateProjectModule(mod, projectDir);
}

export type ProjectLoader = () => Promise<ProjectConfig[]>;

async function loadAllProjects(): Promise<ProjectConfig[]> {
  const projects: ProjectConfig[] = [];
  for (const dir of listProjectDirs()) {
    const config = await loadProjectModule(dir);
    if (config) projects.push(config);
  }
  return projects;
}

export async function listTaskNames(
  loadProjects: ProjectLoader = loadAllProjects,
): Promise<string[]> {
  const projects = await loadProjects();
  const names: string[] = [];
  for (const project of projects) {
    for (const task of project.tasks) {
      names.push(task.name);
    }
  }
  return names.sort((left, right) => left.localeCompare(right));
}

export async function loadTask(
  name: string,
  loadProjects: ProjectLoader = loadAllProjects,
): Promise<TaskConfig> {
  const projects = await loadProjects();

  let found: TaskConfig | null = null;
  for (const project of projects) {
    const task = project.tasks.find((item) => item.name === name);
    if (task) {
      if (found) {
        throw new Error(
          `Ambiguous task "${name}": found in multiple projects. ` +
            `Remove duplicates so each task name is unique.`,
        );
      }
      found = task;
    }
  }

  if (!found) {
    const available = await listTaskNames(loadProjects);
    throw new Error(
      `No task found for "${name}". ` +
        `Expected: projects/*/project.ts declaring a task named "${name}"\n` +
        `Available tasks: ${available.join(", ")}`,
    );
  }

  return found;
}

export async function getProjectNeeds(
  project: string,
  loadProjects: ProjectLoader = loadAllProjects,
): Promise<string[]> {
  const projects = await loadProjects();
  const allNeeds = new Set<string>();

  for (const proj of projects) {
    if (proj.name === project) {
      for (const task of proj.tasks) {
        const needs = normalizeNeeds(task.needs);
        for (const detailKey of Object.values(needs)) {
          allNeeds.add(detailKey);
        }
      }
    }
  }

  return [...allNeeds].sort((left, right) => left.localeCompare(right));
}
