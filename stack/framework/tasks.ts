import type { BrowserAPI } from "../browser/browser.js";
import { z, type ZodType } from "zod";
import type { StepRunnerDeps } from "./step-runner.js";

export type VaultSecrets = Record<string, string>;

/** Returns the last completed step name (from runner.execute()). */
export type TaskRun = (
  browser: BrowserAPI,
  secrets: VaultSecrets,
  deps: StepRunnerDeps,
) => Promise<string>;

// Array shorthand: ["email", "password"] — key and vault detail name are the same.
// Object form: { loginEmail: "email" } — local key differs from vault detail name.
export type TaskNeeds = string[] | Record<string, string>;

export function normalizeNeeds(needs: TaskNeeds): Record<string, string> {
  if (Array.isArray(needs)) {
    return Object.fromEntries(needs.map((key) => [key, key]));
  }
  return needs;
}

export function needsFromSchema(schema: ZodType): Record<string, string> {
  if (schema instanceof z.ZodObject) {
    const shape: Record<string, unknown> = schema.shape;
    return Object.fromEntries(Object.keys(shape).map((key) => [key, key]));
  }
  return {};
}

const taskNeedsSchema = z.union([z.array(z.string()), z.record(z.string(), z.string())]);

const baseTaskFields = {
  name: z.string(),
  displayUrl: z.string(),
  project: z.string(),
  needs: taskNeedsSchema,

  secretsSchema: z.custom<ZodType>((val) => val instanceof z.ZodType).optional(),

  run: z.custom<TaskRun>((val) => typeof val === "function"),
};

const singleAttemptTaskSchema = z.object({
  ...baseTaskFields,
  mode: z.literal("once"),
  keepBrowserOpen: z.boolean().optional(),
});

const retryingTaskSchema = z.object({
  ...baseTaskFields,
  mode: z.literal("retry"),
  intervalMs: z.number(),
});

export const taskConfigSchema = z.discriminatedUnion("mode", [
  singleAttemptTaskSchema,
  retryingTaskSchema,
]);

export type SingleAttemptTask = z.infer<typeof singleAttemptTaskSchema>;
export type RetryingTask = z.infer<typeof retryingTaskSchema>;
export type TaskConfig = z.infer<typeof taskConfigSchema>;

export function validateSecrets(task: TaskConfig, secrets: VaultSecrets): void {
  if (!task.secretsSchema) return;

  const result = task.secretsSchema.safeParse(secrets);
  if (!result.success) {
    throw new Error(`Secrets validation failed for "${task.name}": ${result.error.message}`);
  }
}
