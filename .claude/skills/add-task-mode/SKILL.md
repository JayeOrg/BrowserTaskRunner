---
description: Add a new task execution mode (e.g., scheduled, cron). Use when adding a new way for the framework to orchestrate task runs.
---

# Adding a Task Mode

To add a new task mode (e.g., `scheduled`), touch 2 files:

## 1. Define the interface in `stack/framework/tasks.ts`

Add a new member to the `TaskConfig` discriminated union:

```typescript
export interface ScheduledTask {
  name: string;
  url: string;
  project: string;
  needs: TaskNeeds;
  mode: "scheduled";
  cronExpr: string; // mode-specific fields go here
  secretsSchema?: ZodType;
  run: TaskRun;
}

export type TaskConfig = SingleAttemptTask | RetryingTask | ScheduledTask;
```

Every mode shares `name`, `url`, `project`, `needs`, `mode`, `secretsSchema?`, and `run`. The `mode` field is the discriminant — TypeScript narrows the type via `task.mode === "scheduled"`. Use `needsFromSchema(secretsSchema)` when vault keys match schema keys 1:1.

## 2. Add the execution strategy in `stack/framework/run.ts`

Add a runner function and wire it into `runTask()`:

```typescript
async function runScheduled(
  task: ScheduledTask,
  browser: Browser,
  secrets: TaskContext,
): Promise<void> {
  // Implementation here — the runner owns orchestration,
  // the task's run() implements a single attempt
  const taskLogger = createTaskLogger(task.name);
  const deps = { ...browser.stepRunnerDeps(), taskLogger };
  await task.run(browser, secrets, deps);
  logger.success("TASK SUCCESSFUL!");
  writeAlert(task.name);
}
```

Then add the branch to `runTask()`:

```typescript
async function runTask(task: TaskConfig, secrets: TaskContext): Promise<void> {
  const browser = new Browser(WS_PORT);

  try {
    await browser.start();
    // ...existing setup...

    switch (task.mode) {
      case "once":
        await runSingleAttempt(task, browser, secrets);
        break;
      case "retry":
        await runWithRetry(task, browser, secrets);
        break;
      case "scheduled":
        await runScheduled(task, browser, secrets);
        break;
      default:
        // exhaustiveness check — TypeScript errors if a mode is unhandled
        throw new Error(`Unknown mode: ${(task as TaskConfig).mode}`);
    }
  } finally {
    browser.close();
  }
}
```

## Design rules

- The **runner** owns orchestration (loops, timing, retries, cleanup). Tasks implement a **single attempt**.
- Tasks throw `StepError` (via `logger.fatal()`) on failure, return `TaskResultSuccess` on success.
- Use `node:timers/promises` `setTimeout` for delays — don't import from the tasks layer.
- Add the new mode to `TaskConfig` union so the type system enforces exhaustive handling.
