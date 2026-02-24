import type { ZodType } from "zod";
import {
  defineTask,
  type TaskSpec,
  type StepHandler,
  type WithRun,
  type OnceMode,
  type RetryMode,
} from "./spec.js";
import type { TaskConfig } from "./tasks.js";

interface ProjectBaseSpec {
  name: string;
  displayUrl: string;
  secretsSchema: ZodType;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Erased generic: type safety enforced by Zod schema at runtime, not at the project spec level
type ProjectWithSteps = { steps: StepHandler<any>[] };

type ProjectTaskSpec = ProjectBaseSpec & (ProjectWithSteps | WithRun) & (OnceMode | RetryMode);

export interface ProjectConfig {
  name: string;
  tasks: TaskConfig[];
  task(name: string): TaskConfig;
}

export function defineProject(spec: { name: string; tasks: ProjectTaskSpec[] }): ProjectConfig {
  const tasks = spec.tasks.map((taskSpec) =>
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- ProjectTaskSpec & { project } is structurally TaskSpec but TS can't narrow it
    defineTask({ ...taskSpec, project: spec.name } as TaskSpec<ZodType>),
  );

  return {
    name: spec.name,
    tasks,
    task(name: string): TaskConfig {
      const found = tasks.find((item) => item.name === name);
      if (!found) throw new Error(`No task "${name}" in project "${spec.name}"`);
      return found;
    },
  };
}
