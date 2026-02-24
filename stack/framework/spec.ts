import { type ZodType } from "zod";
import { StepRunner, type StepFn, type StepRunnerDeps } from "./step-runner.js";
import type { BrowserAPI } from "../browser/browser.js";
import { needsFromSchema, type TaskConfig, type TaskRun, type VaultSecrets } from "./tasks.js";

export type StepHandler<Secrets> = StepFn<[BrowserAPI, Secrets]>;

interface BaseSpec<S extends ZodType> {
  name: string;
  displayUrl: string;
  project: string;
  secretsSchema: S;
}

export type WithSteps<S extends ZodType> = { steps: StepHandler<ReturnType<S["parse"]>>[] };
export type WithRun = { run: TaskRun };

export interface OnceMode {
  mode: "once";
  keepBrowserOpen?: boolean;
}

export interface RetryMode {
  mode: "retry";
  intervalMs: number;
}

export type TaskSpec<S extends ZodType> = BaseSpec<S> &
  (WithSteps<S> | WithRun) &
  (OnceMode | RetryMode);

export function defineTask<S extends ZodType>(spec: TaskSpec<S>): TaskConfig {
  const needs = needsFromSchema(spec.secretsSchema);

  const run: TaskRun =
    "steps" in spec
      ? async (
          browser: BrowserAPI,
          secrets: VaultSecrets,
          deps: StepRunnerDeps,
        ): Promise<string> => {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Zod v4 parse() returns output<S> which doesn't unify with ReturnType<S["parse"]> in generic context
          const parsed = spec.secretsSchema.parse(secrets) as ReturnType<S["parse"]>;
          const runner = new StepRunner(deps);
          for (const handler of spec.steps) {
            runner.step(handler, browser, parsed);
          }
          return runner.execute();
        }
      : spec.run;

  const base = {
    name: spec.name,
    displayUrl: spec.displayUrl,
    project: spec.project,
    needs,
    secretsSchema: spec.secretsSchema,
    run,
  };

  return spec.mode === "retry"
    ? { ...base, mode: "retry" as const, intervalMs: spec.intervalMs }
    : { ...base, mode: "once" as const, keepBrowserOpen: spec.keepBrowserOpen };
}
