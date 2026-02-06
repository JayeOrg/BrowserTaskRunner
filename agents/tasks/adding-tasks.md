# Adding a Task

To add a new task (e.g., `acmeLogin`), touch 2 files:

## 1. Create the task file in `stack/tasks/`

Copy `stack/tasks/botc.ts` as a starting point. A task file contains:

- Constants: `TASK`, `TIMINGS`, `SELECTORS`
- Step functions at file scope (not nested in `run`)
- A `run` function that orchestrates the steps
- An exported task config with a type annotation

### Task modes

Tasks declare their retry semantics via a discriminated union:

```typescript
// Single attempt — runs once, succeeds or throws
export const acmeCheckTask: SingleAttemptTask = {
  name: "acmeCheck",
  url: "https://example.com",
  mode: "once",
  run,
};

// Retrying — runner retries on failure at the given interval
export const acmeLoginTask: RetryingTask = {
  name: "acmeLogin",
  url: "https://example.com",
  mode: "retry",
  intervalMs: 300_000,
  run,
};
```

The runner owns the retry loop. Tasks implement a single attempt — throw `StepError` (via `logger.fail()`) on failure, return `TaskResultSuccess` on success.

### Context validation (optional)

Add a `contextSchema` using `zod` to validate required environment variables:

```typescript
import { z } from "zod";

const contextSchema = z.object({
  SITE_EMAIL: z.string().min(1),
  SITE_PASSWORD: z.string().min(1),
});
```

The runner calls `contextSchema.safeParse(context)` before `run()` and fails fast with a clear message if validation fails. Inside `run()`, use `contextSchema.parse(context)` for type narrowing:

```typescript
const { SITE_EMAIL: email, SITE_PASSWORD: password } =
  contextSchema.parse(context);
```

### Step functions

Define steps as file-scope functions, not nested inside `run`. Pass `browser` and `logger` explicitly:

```typescript
async function navigate(browser: Browser, logger: TaskLogger): Promise<void> {
  await browser.navigate(TASK.url);
  await sleep(TIMINGS.afterNav);
  const { url, title } = await browser.getUrl();
  logger.success("navigate", "Navigated", { url, title });
}
```

Use `logger.fail()` for step failures — it throws a `StepError` which the framework catches and logs.

## 2. Register in `stack/framework/registry.ts`

Add the import and array entry:

```typescript
import type { TaskConfig } from "./tasks.js";
import { botcLoginTask } from "../tasks/botc.js";
import { acmeLoginTask } from "../tasks/acme.js";

export const allTasks: TaskConfig[] = [botcLoginTask, acmeLoginTask];
```

TypeScript enforces every entry is a valid `TaskConfig`. If you forget this step, the task won't be available at runtime — `getTask()` will throw with the available task names listed.

## Running

```bash
npm run check acmeLogin          # Docker
npm run dev -- acmeLogin          # Local (after npm run build)
```

Environment variables starting with `SITE_` are loaded from `.env` and passed as `TaskContext`.
