# Tasks

Site-specific automation logic. Each task defines what to do on a particular site -- selectors, timing, detection strategies. The framework handles when and how often to run it.

## How It Works

A task is a `TaskConfig` object with:

- `name` / `url` - Identity and target
- `mode` - `"once"` or `"retry"` (with `intervalMs`)
- `contextSchema` - Optional Zod schema for required env vars
- `run(browser, context)` - Single-attempt function that uses `Browser` methods to automate the page

Tasks throw `StepError` on failure. The framework catches it and either reports or retries depending on mode.

## Files

- `botc.ts` - Login task for botc.app (navigate, fill credentials, handle Turnstile, submit, verify)
- `utils/selectors.ts` - `waitForFirst`, `clickFirst`, `fillFirst` -- race multiple selectors
- `utils/timing.ts` - `sleep()` utility
- `utils/turnstile.ts` - Cloudflare Turnstile detection and clicking

## Adding a Task

See `agents/tasks/adding-tasks.md` for the full guide.
