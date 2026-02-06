# Framework

Orchestration layer that runs tasks. Owns retry logic, context loading, validation, logging, and error handling. No site-specific knowledge.

## How It Works

1. Reads the task name from `process.argv[2]`
2. Looks up the task in the registry
3. Loads context from `SITE_`-prefixed environment variables
4. Validates context against the task's optional Zod schema
5. Starts a `Browser` WebSocket connection
6. Runs the task in single-attempt or retry mode
7. On success, writes an alert file to `logs/`

## Files

- `main.ts` - Entry point and orchestration (retry loop, single-attempt runner)
- `tasks.ts` - Task type definitions (`SingleAttemptTask`, `RetryingTask`, `TaskConfig`)
- `registry.ts` - Manual task registry
- `logging.ts` - `TaskLogger` (scoped, step-based) and `PrefixLogger` (simple prefix)
- `errors.ts` - `StepError` class and `TaskResultFailure` type

## Task Modes

- **`once`** - Run a single attempt. Throw on failure.
- **`retry`** - Loop with a configurable interval until success. `StepError` failures are logged and retried; unexpected errors are also retried.

## Adding a Task

See `agents/tasks/adding-tasks.md` for the full guide. In short:

1. Create a task file in `stack/tasks/`
2. Export a `TaskConfig` object
3. Register it in `stack/framework/registry.ts`
