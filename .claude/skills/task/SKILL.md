---
description: Create a project, add a task, add a task mode, or add a shared task utility. Use for anything in stack/projects/ or task-related framework changes.
---

# Tasks

## Creating a Project

A project is a goal that may span multiple tasks (e.g., "monitor-acme"). To set up a new project end-to-end:

### 1. Create the project directory

```text
stack/projects/acme/
  project.ts         <- the source of truth (declares all tasks)
  tasks/
    acmeLogin.steps.ts  <- step implementations
```

### 2. Create the vault project

```bash
npm run vault -- login
npm run vault -- project create monitor-acme
```

Save the output token for `.env`.

### 3. Write the project spec

See "Writing a Project Spec" below. Export `const project` from `project.ts`. No registration needed — the loader discovers `project.ts` files automatically.

### 4. Add vault details

After writing the project spec and building, use `project setup` to add all missing secrets:

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

A project can have multiple tasks sharing the same vault credentials. All tasks are declared in the same `project.ts` and share the same `VAULT_TOKEN`.

---

## Writing a Project Spec

Projects use `defineProject()` from `stack/framework/project.js`. Each project is one spec file plus steps files:

```
stack/projects/<name>/
  project.ts               the source of truth (declares all tasks)
  tasks/
    <taskName>.steps.ts    handlers: constants, step implementations
```

Copy `stack/projects/botc/project.ts` as a starting point. See docs/stack/projects.md for task design principles (poll-then-act, deterministic clicks, Cloudflare rules).

### Project spec (the source of truth)

The project spec is what you read to understand every task in a project. It declares config, secrets schema, and step sequences — pure data, no code:

```typescript
import { defineProject } from "../../framework/project.js";
import { loginSecretsSchema } from "../utils/schemas.js";
import { navigate, fillLogin, submit, checkResult } from "./tasks/acmeLogin.steps.js";

export const project = defineProject({
  name: "monitor-acme",
  tasks: [{
    name: "acmeLogin",
    displayUrl: "https://acme.com/login",
    mode: "retry",
    intervalMs: 300_000,
    secretsSchema: loginSecretsSchema,
    steps: [navigate, fillLogin, submit, checkResult],
  }],
});
```

`defineProject` injects the project name into each task, auto-derives `needs` from `secretsSchema`, and generates the `run` function from the `steps` array.

### Steps file (implementation details)

Constants (`TIMINGS`, `SELECTORS`) and step handler functions live here:

```typescript
import type { StepLogger } from "../../../framework/logging.js";
import type { BrowserAPI } from "../../../browser/browser.js";

const TIMINGS = { afterNav: 2000, waitEmail: 15000 } as const;
const SELECTORS = { email: ['input[type="email"]'] } as const;

type Secrets = { email: string; password: string };

export async function navigate(log: StepLogger, browser: BrowserAPI) {
  await browser.navigate("https://acme.com/login");
  log.success("Navigated");
}

export async function fillLogin(log: StepLogger, browser: BrowserAPI, secrets: Secrets) {
  const { email, password } = secrets;
  // ... use SELECTORS, TIMINGS ...
}
```

### Handler signature (steps array mode)

All handlers share: `(log: StepLogger, browser: BrowserAPI, secrets: z.infer<Schema>) => Promise<void>`

`defineTask` parses secrets once and passes `(browser, parsedSecrets)` to every handler. Handlers that don't need secrets simply omit the param — TypeScript allows fewer params than the type declares.

### Custom run mode (complex tasks)

For tasks needing `conditionalStep`, `named`, loops, or shared state, provide a `run` function instead of `steps`. The `run` function lives in the steps file (specs must not include code):

```typescript
// nandosOrder.steps.ts — exports run for use by project.ts
export const run: TaskRun = async (browser, secrets, deps) => {
  const { email, password, firstName } = nandosSecretsSchema.parse(secrets);
  const state = { alreadyLoggedIn: false };
  const needsLogin = () => !state.alreadyLoggedIn;
  const runner = new StepRunner(deps);
  runner
    .step(checkSession, browser, firstName, state)
    .conditionalStep(needsLogin, navigate, browser)
    .conditionalStep(needsLogin, login, browser, email, password);
  return runner.execute();
};
```

```typescript
// project.ts — pure data, imports run from steps
import { run } from "./tasks/nandosOrder.steps.js";

export const project = defineProject({
  name: "nandos",
  tasks: [{
    name: "nandosOrder",
    displayUrl: "https://www.nandos.com.au/sign-in",
    mode: "once",
    keepBrowserOpen: true,
    secretsSchema: nandosSecretsSchema,
    run,
  }],
});
```

In custom run mode, step handlers keep their existing per-step signatures — the `run` function threads specific args to each step.

### Task modes

Two modes — see `stack/framework/tasks.ts` for the full type definitions:

- **`once` (SingleAttemptTask)** — runs once, succeeds or throws
- **`retry` (RetryingTask)** — retries on failure at `intervalMs` interval

### Secrets validation

```typescript
const secretsSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});
```

The runner calls `safeParse()` before `run()`. In steps array mode, `defineTask` parses secrets automatically. In custom run mode, use `secretsSchema.parse(secrets)` for type narrowing.

### StepRunner rules

- Step functions take `log: StepLogger` as the first parameter, followed by dependencies
- Register with `.step(fn, ...args)` — name is auto-derived from `fn.name`. Anonymous arrows are rejected at runtime
- For reused functions, use `.named(subtitle, fn, ...args)` — produces `fn.name:subtitle` (e.g. `addMenuItem:PERi-Chip Wrap`)
- Conditional steps use `.conditionalStep(condition, fn, ...args)` or `.skipIf(predicate)` chained after `.step()`
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
