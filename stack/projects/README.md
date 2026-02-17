# Projects

Each project is a goal that may span multiple tasks across multiple sites. Projects live in their own subdirectory and declare which vault details they need.

## Structure

```
projects/
  botc/           # One directory per project
    tasks/
      botcLogin.ts
    README.md
  nandos/
    tasks/
      nandosOrder.ts
    README.md
  utils/          # Shared task utilities
    selectors.ts  # waitForFirst, clickFirst, fillFirst
    timing.ts     # sleep()
    turnstile.ts  # Cloudflare Turnstile detection
    poll.ts       # pollUntil — generic polling
    schemas.ts    # Shared Zod context schemas
    dump.ts       # HTML dumper for debugging
```

## How It Works

A task is a `TaskConfig` object with:

- `name` / `url` - Identity and target
- `project` - Vault project name for secret access
- `needs` - Maps local context keys to vault detail keys
- `mode` - `"once"` or `"retry"` (with `intervalMs`)
- `contextSchema` - Optional Zod schema for context validation
- `run(browser, context, deps)` - Single-attempt function that uses `Browser` methods to automate the page. `deps: StepRunnerDeps` is passed to `new StepRunner(deps)`

Tasks throw `StepError` on failure. The framework catches it and either reports or retries depending on mode.

## Adding a Project

1. Create `stack/projects/<name>/tasks/<taskName>.ts`
2. Export `const task: TaskConfig` — the loader discovers it by filename convention
3. Create vault project and secrets, add token to `.env`
