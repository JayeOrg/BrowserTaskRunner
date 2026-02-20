# SiteCheck

Automated login checker for sites with human verification (Cloudflare Turnstile, etc).

## The Problem

Cloudflare detects browser automation tools (Playwright, Puppeteer, Selenium) via the Chrome DevTools Protocol (CDP). See [REJECTED.md](./REJECTED.md) for details on what doesn't work.

## Solution

Uses a Chrome extension that communicates via WebSocket. No CDP = no detection.

## Quick Start

**Prerequisites:** Docker and Docker Compose (all tasks run inside Docker — there is no local execution path).

1. Install dependencies:

    ```bash
    npm install
    ```

2. Initialize the vault and add credentials:

    ```bash
    npm run vault -- init
    npm run vault -- project create monitor-botc
    npm run vault -- detail set monitor-botc email user@example.com
    npm run vault -- detail set monitor-botc password hunter2
    ```

    The CLI prompts for the vault password interactively. Save the token to `.env` using the per-project naming convention:

    ```env
    VAULT_TOKEN_MONITOR_BOTC=<token from project create>
    ```

3. Run a task:

    ```bash
    npm run check botcLogin
    ```

## Available Tasks

| Task          | URL                                 | Description                          |
| ------------- | ----------------------------------- | ------------------------------------ |
| `botcLogin`   | https://botc.app/                   | Login flow for botc.app              |
| `nandosOrder` | https://www.nandos.com.au/sign-in   | Login + order for Nando's Australia  |

## Running

Tasks run inside Docker — there is no local-dev-without-Docker path. Docker provides the full stack: Xvfb (virtual display), Chrome with the extension pre-loaded, the WebSocket bridge, and the framework.

```bash
npm run check <taskName>
```

To debug with VNC (enabled by default):

```bash
npm run check botcLogin
# Connect VNC viewer to localhost:5900 (no password)
```

To disable VNC:

```bash
npm run check botcLogin --no-vnc
```

[Full documentation](./stack/infra/README.md) | [Browser & extension](./stack/browser/README.md) | [Developer guide & conventions](./AGENTS.md)

## Development

Quick check (lint + build + tests):

```bash
npm run validate
```

## Adding New Tasks

1. Create a task file in `stack/projects/yoursite/tasks/yourSite.ts`. The filename must match the task name. Import paths must use `.js` extensions (ESM/NodeNext requirement — TypeScript resolves them to the source `.ts` files). Export `const task`:

    ```typescript
    // stack/projects/yoursite/tasks/yourSite.ts
    import type { RetryingTask, VaultSecrets } from "../../../framework/tasks.js";
    import { needsFromSchema } from "../../../framework/tasks.js";
    import { StepRunner, type StepRunnerDeps } from "../../../framework/step-runner.js";
    import type { StepLogger } from "../../../framework/logging.js";
    import { loginSecretsSchema } from "../../utils/schemas.js";

    const TASK = {
        name: "yourSite",
        displayUrl: "https://yoursite.com/login",
    } as const;

    // Step functions: log first, then dependencies
    async function navigate(log: StepLogger, browser: BrowserAPI) { /* ... */ }
    async function verify(log: StepLogger, browser: BrowserAPI) { /* ... */ }

    export const task: RetryingTask = {
        ...TASK,
        project: "monitor-yoursite",
        needs: needsFromSchema(loginSecretsSchema),
        mode: "retry",
        intervalMs: 300_000,
        secretsSchema: loginSecretsSchema,
        run: async (browser, secrets, deps) => {
            const { email, password } = loginSecretsSchema.parse(secrets);
            const runner = new StepRunner(deps);
            runner
                .step(navigate, browser)
                .step(verify, browser);
            return runner.execute();
        },
    };
    ```

    Task discovery is convention-based — no registry file. The loader finds `export const task` in `stack/projects/*/tasks/*.ts`.

2. Set up vault secrets and run:
    ```bash
    npm run vault -- project create monitor-yoursite
    npm run vault -- detail set monitor-yoursite email user@example.com
    npm run vault -- detail set monitor-yoursite password hunter2
    # Add token to .env: VAULT_TOKEN_MONITOR_YOURSITE=<token>
    npm run check yourSite
    ```

## Project Structure

```
stack/
├── framework/       # Orchestration, types, logging, errors
│   ├── run.ts       # Entry point
│   ├── tasks.ts     # TaskConfig types
│   ├── loader.ts    # Convention-based task discovery
│   ├── step-runner.ts # StepRunner (pause/play/skip controls)
│   ├── logging.ts   # Logging infrastructure
│   └── errors.ts    # Result types + StepError
├── projects/        # Project-specific task implementations
│   ├── botc/        # BotC login project
│   ├── nandos/      # Nando's order project
│   └── utils/       # Shared task utilities (selectors, timing, polling)
├── vault/           # Local secrets service (SQLite + AES-256-GCM)
├── browser/         # WebSocket server — typed browser API
│   └── browser.ts
├── extension/       # Chrome extension (manifest, messages)
│   └── service-worker.ts
└── infra/           # Docker and deployment
    ├── Dockerfile
    ├── docker-compose.yml
    ├── check.ts     # CLI entry point (npm run check)
    └── run.ts       # Container entry point
```

## Alerts

On success, an alert file `alert-<taskName>.txt` is written to `logs/` and the terminal bell is triggered as an audible notification. All framework and task logs are also written to `logs/task-<taskName>.log`.
