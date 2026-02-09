# Projects

Each project is a goal that may span multiple tasks across multiple sites. Projects live in their own subdirectory and declare which vault details they need.

## Structure

```
projects/
  botc/           # One directory per project
    tasks/
      botc.ts     # Task implementation
    README.md     # Project-specific docs
  utils/          # Shared task utilities
    selectors.ts  # waitForFirst, clickFirst, fillFirst
    timing.ts     # sleep()
    turnstile.ts  # Cloudflare Turnstile detection
```

## How It Works

A task is a `TaskConfig` object with:

- `name` / `url` - Identity and target
- `project` - Vault project name for secret access
- `needs` - Maps local context keys to vault detail keys
- `mode` - `"once"` or `"retry"` (with `intervalMs`)
- `contextSchema` - Optional Zod schema for context validation
- `run(browser, context)` - Single-attempt function that uses `Browser` methods to automate the page

Tasks throw `StepError` on failure. The framework catches it and either reports or retries depending on mode.

## Adding a Project

See `agents/tasks/adding-tasks.md` for the full guide.
