---
description: Add a new task to an existing project. Use when creating a new site-specific automation task.
---

# Adding a Task

To add a new task (e.g., `acmeLogin`), create one file:

## 1. Create the task file in `stack/projects/`

**File naming convention**: the filename must match the task name. A task named `acmeLogin` lives at `stack/projects/acme/tasks/acmeLogin.ts`.

Copy `stack/projects/botc/tasks/botcLogin.ts` as a starting point. A task file contains:

- Constants: `TASK`, `TIMINGS`, `SELECTORS`
- Step functions at file scope (not nested in `run`)
- A `run` function that orchestrates steps via `StepRunner`
- An exported task config with a type annotation

### Task modes

Tasks declare their retry semantics via a discriminated union:

```typescript
// Single attempt — runs once, succeeds or throws
// File: stack/projects/acme/tasks/acmeCheck.ts
export const task: SingleAttemptTask = {
  name: "acmeCheck",
  url: "https://example.com",
  project: "acme",
  needs: ["email", "password"],
  mode: "once",
  contextSchema,
  run,
};

// Retrying — runner retries on failure at the given interval
// File: stack/projects/acme/tasks/acmeLogin.ts
export const task: RetryingTask = {
  name: "acmeLogin",
  url: "https://example.com",
  project: "monitor-acme",
  needs: ["email", "password"],
  mode: "retry",
  intervalMs: 300_000,
  contextSchema,
  run,
};
```

The runner owns the retry loop. Tasks implement a single attempt — throw `StepError` (via `logger.fail()`) on failure, return `TaskResultSuccess` on success.

### `needs` — vault detail mapping

Array shorthand when the local key and vault detail name are the same:

```typescript
needs: ["email", "password"],
```

Object form when they differ:

```typescript
needs: { loginEmail: "email", loginPassword: "password" },
```

### Context validation (optional)

Add a `contextSchema` using `zod` to validate the context loaded from the vault:

```typescript
import { z } from "zod";

const contextSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});
```

The runner calls `contextSchema.safeParse(context)` before `run()` and fails fast with a clear message if validation fails. Inside `run()`, use `contextSchema.parse(context)` for type narrowing:

```typescript
const { email, password } = contextSchema.parse(context);
```

### Step functions

Define steps as file-scope functions, not nested inside `run`. Pass `browser` and `logger` explicitly:

```typescript
async function navigate(browser: BrowserAPI, logger: TaskLogger): Promise<void> {
  await browser.navigate(TASK.url);
  await sleep(TIMINGS.afterNav);
  const { url, title } = await browser.getUrl();
  logger.success("navigate", "Navigated", { url, title });
}
```

Use `logger.fail()` for step failures — it throws a `StepError` which the framework catches and logs.

### StepRunner

All tasks use `StepRunner` to register named steps (enables the debug overlay):

```typescript
async function run(
  browser: BrowserAPI,
  context: TaskContext,
  logger: TaskLogger,
): Promise<TaskResultSuccess> {
  const { email, password } = contextSchema.parse(context);
  let finalUrl = "";

  const runner = new StepRunner(browser.stepRunnerDeps());

  runner
    .step("navigate", () => navigate(browser, logger))
    .step("fillLogin", () => fillLogin(browser, logger, email, password))
    .step("submit", () => submit(browser, logger))
    .step("verify", async () => {
      finalUrl = await verify(browser, logger);
    });

  await runner.execute();

  return { ok: true, step: "verify", finalUrl };
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
  logger.fail(step, "TARGET_NOT_FOUND", { details: "..." });
}
```

## 2. That's it — no registration needed

The loader discovers tasks by filename convention. Name the file `{taskName}.ts`, export `const task`, and it's available immediately.

## Running

```bash
npm run check acmeLogin
```

Context is loaded from the vault using the task's `project` and `needs` fields. See `stack/vault/README.md`.
