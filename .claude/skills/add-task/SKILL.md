---
description: Add a new task to an existing project. Use when creating a new site-specific automation task.
---

# Adding a Task

To add a new task (e.g., `acmeLogin`), create one file:

## 1. Create the task file in `stack/projects/`

**File naming convention**: the filename must match the task name. A task named `acmeLogin` lives at `stack/projects/acme/tasks/acmeLogin.ts`.

Copy `stack/projects/botc/tasks/botcLogin.ts` as a starting point. A task file contains:

- Constants: `TASK`, `FINAL_STEP`, `TIMINGS`, `SELECTORS`
- Step functions at file scope (not nested in `run`)
- A `run` function that orchestrates steps via `StepRunner`
- An exported task config with a type annotation

### `FINAL_STEP` pattern

Extract the last step's name to a typed constant so the step registration and return value can't drift apart:

```typescript
const FINAL_STEP = "verify" as const;

// In run():
runner.step(FINAL_STEP, async (log) => { finalUrl = await verify(browser, log); });
await runner.execute();
return { step: FINAL_STEP, finalUrl };
```

### Task modes

Tasks declare their retry semantics via a discriminated union:

```typescript
// Single attempt — runs once, succeeds or throws
// File: stack/projects/acme/tasks/acmeCheck.ts
export const task: SingleAttemptTask = {
  name: "acmeCheck",
  displayUrl: "https://example.com",
  project: "acme",
  needs: needsFromSchema(secretsSchema),
  mode: "once",
  secretsSchema,
  run,
};

// Retrying — runner retries on failure at the given interval
// File: stack/projects/acme/tasks/acmeLogin.ts
export const task: RetryingTask = {
  name: "acmeLogin",
  displayUrl: "https://example.com",
  project: "monitor-acme",
  needs: needsFromSchema(secretsSchema),
  mode: "retry",
  intervalMs: 300_000,
  secretsSchema,
  run,
};
```

The runner owns the retry loop. Tasks implement a single attempt — throw `StepError` (via `logger.fatal()`) on failure, return `TaskResultSuccess` on success.

### `needs` — vault detail mapping

Every task must declare `needs` — a mapping from local secrets keys to vault detail names. Use `needsFromSchema` when the keys match 1:1:

```typescript
import { needsFromSchema } from "../../../framework/tasks.js";

// When keys match vault detail names (common case)
needs: needsFromSchema(secretsSchema),
// Produces: { email: "email", password: "password" }

// When local keys differ from vault detail names
needs: { loginEmail: "email", loginPassword: "password" },
```

`needs` is always **explicit** — it is never derived implicitly from `secretsSchema`. The schema validates shape/types; `needs` maps vault keys. They overlap in the common case but serve different purposes.

### Secrets validation

Add a `secretsSchema` using `zod` to validate the secrets loaded from the vault:

```typescript
import { z } from "zod";

const secretsSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});
```

The runner calls `secretsSchema.safeParse(secrets)` before `run()` and fails fast with a clear message if validation fails. Inside `run()`, use `secretsSchema.parse(secrets)` for type narrowing:

```typescript
const { email, password } = secretsSchema.parse(secrets);
```

### Step functions

Define steps as file-scope functions, not nested inside `run`. Pass `browser` and `logger` explicitly:

```typescript
async function navigate(browser: BrowserAPI, log: StepLogger): Promise<void> {
  await browser.navigate(TASK.displayUrl);
  await sleep(TIMINGS.afterNav);
  const { url, title } = await browser.getUrl();
  log.success("Navigated", { url, title });
}
```

Use `logger.fatal()` for step failures — it throws a `StepError` which the framework catches and logs.

### StepRunner

All tasks use `StepRunner` to register named steps (enables the debug overlay). The `run` function receives `deps: StepRunnerDeps` which contains `taskLogger` and the plumbing needed by `StepRunner`:

```typescript
async function run(
  browser: BrowserAPI,
  secrets: TaskContext,
  deps: StepRunnerDeps,
): Promise<TaskResultSuccess> {
  const { email, password } = secretsSchema.parse(secrets);
  let finalUrl = "";

  const runner = new StepRunner(deps);

  runner
    .step("navigate", (log) => navigate(browser, log))
    .step("fillLogin", (log) => fillLogin(browser, log, email, password))
    .step("submit", (log) => submit(browser, log))
    .step("verify", async (log) => {
      finalUrl = await verify(browser, log);
    });

  await runner.execute();

  return { lastCompletedStep: "verify", finalUrl };
}
```

Steps that return values used later: capture into a closure variable, assign inside the step fn.

### Polling with `pollUntil`

Use `pollUntil` from `../../utils/poll.js` for wait-until-ready patterns:

```typescript
import { pollUntil } from "../../utils/poll.js";

const result = await pollUntil(
  () => browser.getContent("body"),
  (c) => c.content.includes("Target text"),
  { timeoutMs: 15_000, intervalMs: 2000 },
);
if (!result.ok) {
  logger.fatal("TARGET_NOT_FOUND", { details: "..." });
}
```

## 2. That's it — no registration needed

The loader discovers tasks by filename convention. Name the file `{taskName}.ts`, export `const task`, and it's available immediately.

## Running

```bash
npm run check acmeLogin
```

Secrets are loaded from the vault using the task's `project` and `needs`. See `stack/vault/README.md`.
