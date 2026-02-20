---
description: Create a project, add a task, add a task mode, or add a shared task utility. Use for anything in stack/projects/ or task-related framework changes.
---

# Tasks

## Creating a Project

A project is a goal that may span multiple tasks (e.g., "monitor-acme"). To set up a new project end-to-end:

### 1. Create the project directory

```
stack/projects/acme/
  tasks/
    acmeLogin.ts     <- task file, named after the task
```

### 2. Create the vault project

```bash
npm run vault -- login
npm run vault -- project create monitor-acme
```

Save the output token for `.env`.

### 3. Write the task file

See "Writing a Task File" below. Name the file `{taskName}.ts`, export `const task`. No registration needed — the loader discovers by filename.

### 4. Add vault details

After writing the task and building, use `project setup` to add all missing secrets:

```bash
npm run build
npm run vault -- project setup monitor-acme
```

Or add individually: `npm run vault -- detail set monitor-acme email`

### 5. Set up `.env`

```bash
npm run vault -- project export monitor-acme
```

```env
VAULT_TOKEN_MONITOR_ACME=<token from export>
```

The framework resolves tokens via `VAULT_TOKEN_${project.toUpperCase().replace(/-/g, "_")}`.

### Multiple tasks per project

A project can have multiple tasks sharing the same vault credentials. Both declare `project: "monitor-acme"` and share the same `VAULT_TOKEN`.

---

## Writing a Task File

Create one file at `stack/projects/<name>/tasks/<taskName>.ts`. Copy `stack/projects/botc/tasks/botcLogin.ts` as a starting point. See AGENTS.md for task design principles (poll-then-act, deterministic clicks, Cloudflare rules).

### Constants

Every task file defines at file top:

- `TASK` — `{ name, displayUrl }` (name must match filename)
- `TIMINGS` — timing constants (delays, timeouts)
- `SELECTORS` — CSS selectors

### `run()` returns `runner.execute()`

`execute()` returns the last completed step name. The framework captures the browser URL automatically:

```typescript
runner.step(verify, browser);
return runner.execute();
```

### Task modes

```typescript
// Single attempt — runs once, succeeds or throws
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

### `needs` — vault detail mapping

```typescript
import { needsFromSchema } from "../../../framework/tasks.js";

// When keys match vault detail names (common case)
needs: needsFromSchema(secretsSchema),
// Produces: { email: "email", password: "password" }

// When local keys differ from vault detail names
needs: { loginEmail: "email", loginPassword: "password" },
```

`needs` is always explicit — never derived implicitly from `secretsSchema`.

### Secrets validation

```typescript
const secretsSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});
```

The runner calls `safeParse()` before `run()`. Inside `run()`, use `secretsSchema.parse(secrets)` for type narrowing.

### Step functions

Define at file scope, not nested inside `run`. Pass `browser` and `logger` explicitly:

```typescript
async function navigate(browser: BrowserAPI, log: StepLogger): Promise<void> {
  await browser.navigate(TASK.displayUrl);
  await sleep(TIMINGS.afterNav);
  const { url, title } = await browser.getUrl();
  log.success("Navigated", { url, title });
}
```

Use `logger.fatal()` for step failures — it throws a `StepError`.

### `run` function

Receives `deps: StepRunnerDeps`. Create a `StepRunner(deps)`, chain `.step()` calls, `return runner.execute()`.

**StepRunner rules:**
- Step functions take `log: StepLogger` as the first parameter, followed by dependencies: `async function navigate(log: StepLogger, browser: BrowserAPI): Promise<void>`
- Register with `.step(fn, ...args)` — name is auto-derived from `fn.name`. Anonymous arrows are rejected at runtime
- For reused functions, use `.named(subtitle, fn, ...args)` — produces `fn.name:subtitle` (e.g. `addMenuItem:PERi-Chip Wrap`)
- Conditional steps use `.skipIf(predicate)` chained after `.step()` or `.named()`
- The runner chains with `.step()` returning `this` — use a single chain, break with `for` loops for dynamic steps
- Steps that return values used later: pass a state object as an arg. **Minimise these** — merge tightly-coupled steps instead
- `pauseOnError` defaults to `true` — failed steps pause for VNC inspection. Tests pass `pauseOnError: false` so errors throw immediately

---

## Adding a Task Mode

To add a new mode (e.g., `scheduled`), touch 2 files:

### 1. Define the interface in `stack/framework/tasks.ts`

Add a new member to the `TaskConfig` discriminated union:

```typescript
export interface ScheduledTask {
  name: string;
  url: string;
  project: string;
  needs: TaskNeeds;
  mode: "scheduled";
  cronExpr: string; // mode-specific fields
  secretsSchema?: ZodType;
  run: TaskRun;
}

export type TaskConfig = SingleAttemptTask | RetryingTask | ScheduledTask;
```

### 2. Add the execution strategy in `stack/framework/run.ts`

Add a runner function and wire into `runTask()`:

```typescript
async function runScheduled(
  task: ScheduledTask,
  browser: Browser,
  secrets: TaskContext,
): Promise<void> {
  const taskLogger = createTaskLogger(task.name);
  const deps = { ...browser.stepRunnerDeps(), taskLogger };
  await task.run(browser, secrets, deps);
  logger.success("TASK SUCCESSFUL!");
  writeAlert(task.name);
}
```

Add the branch to the `switch (task.mode)` in `runTask()`. TypeScript errors if a mode is unhandled (exhaustiveness via `default` case).

**Design rules:** The runner owns orchestration (loops, timing, retries). Tasks implement a single attempt. Use `node:timers/promises` `setTimeout` for delays.

---

## Adding a Task Utility

Shared utilities live in `stack/projects/utils/`: `dump.ts` (HTML dumper), `turnstile.ts` (Cloudflare), `selectors.ts` (`waitForFirst`/`clickFirst`/`fillFirst`), `timing.ts` (`sleep`), `poll.ts` (`pollUntil`), `schemas.ts` (`loginSecretsSchema`).

### Creating a utility

Add a new file in `stack/projects/utils/`:

```typescript
import type { BrowserAPI } from "../../browser/browser.js";

export async function assertUrlChanged(
  browser: BrowserAPI,
  originalUrl: string,
): Promise<{ url: string; title: string }> {
  const { url, title } = await browser.getUrl();
  if (url === originalUrl) {
    throw new Error(`URL did not change from ${originalUrl}`);
  }
  return { url, title };
}
```

### Design rules

1. **No site-specific knowledge** — selectors, URLs, and timing values come from the task
2. **Take `BrowserAPI`, not `Browser`** — accept the interface so tests can use mocks
3. **Return discriminated results** — prefer `{ found: true } | { found: false, error? }` over throwing
4. **Don't log** — the calling task owns logging
5. **Don't retry** — the framework owns retry loops

Import from the actual source module:

```typescript
import { waitForFirst, clickFirst } from "../../utils/selectors.js";
```
