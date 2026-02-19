# Framework

Orchestration layer that runs tasks. Owns retry logic, context loading, validation, logging, and error handling. No site-specific knowledge.

## How It Works

1. Reads the task name from `process.argv[2]`
2. Discovers and loads the task by filename convention
3. Loads context from vault using `VAULT_TOKEN_<PROJECT>` and the task's `needs` mapping
4. Validates context against the task's optional Zod schema
5. Starts a `Browser` WebSocket connection
6. Runs the task in single-attempt or retry mode
7. On success, writes an alert file to the project root

## Files

- `run.ts` - Entry point and orchestration (retry loop, single-attempt runner)
- `tasks.ts` - Task type definitions (`SingleAttemptTask`, `RetryingTask`, `TaskConfig`, `needsFromSchema`)
- `loader.ts` - Convention-based task discovery (filename = task name)
- `step-runner.ts` - `StepRunner` class (pause/play/skip overlay controls)
- `logging.ts` - `TaskLogger` (scoped, step-based) and `PrefixLogger` (simple prefix)
- `errors.ts` - `StepError` class and `toErrorMessage` helper

## Task Modes

- **`once`** - Run a single attempt. Throw on failure.
- **`retry`** - Loop with a configurable interval until success. `StepError` failures are logged and retried; unexpected errors are re-thrown (fatal).

## Adding a Task

In short:

1. Create a project directory in `stack/projects/<name>/tasks/`
2. Name the file `<taskName>.ts` (must match the `name` field in the task config)
3. Export `const task: TaskConfig` — the loader discovers it by filename
