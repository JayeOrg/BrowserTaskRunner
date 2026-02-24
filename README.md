# BrowserTaskRunner

Browser task automation

## The Problem (why not just playwright?)

Cloudflare detects browser automation tools (Playwright, Puppeteer, Selenium) via the Chrome DevTools Protocol (CDP). See [REJECTED.md](./docs/REJECTED.md) for details on what doesn't work.

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

| Task          | URL                               | Description                         |
| ------------- | --------------------------------- | ----------------------------------- |
| `botcLogin`   | https://botc.app/                 | Login flow for botc.app             |
| `nandosOrder` | https://www.nandos.com.au/sign-in | Login + order for Nando's Australia |

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

Projects use spec-driven development — one `project.ts` per project is the single source of truth. Read it to understand every task in the project. Implementation details live in colocated `.steps.ts` files.

1. Create `stack/projects/yoursite/project.ts` and a steps file. Import paths must use `.js` extensions (ESM/NodeNext requirement). Export `const project`:

   ```typescript
   // stack/projects/yoursite/project.ts (the source of truth — pure data, no code)
   import { defineProject } from "../../framework/project.js";
   import { loginSecretsSchema } from "../utils/schemas.js";
   import { navigate, fillLogin, verify } from "./tasks/yourSite.steps.js";

   export const project = defineProject({
     name: "monitor-yoursite",
     tasks: [{
       name: "yourSite",
       displayUrl: "https://yoursite.com/login",
       mode: "retry",
       intervalMs: 300_000,
       secretsSchema: loginSecretsSchema,
       steps: [navigate, fillLogin, verify],
     }],
   });
   ```

   ```typescript
   // stack/projects/yoursite/tasks/yourSite.steps.ts (implementation details)
   import type { StepLogger } from "../../../framework/logging.js";
   import type { BrowserAPI } from "../../../browser/browser.js";

   type Secrets = { email: string; password: string };

   export async function navigate(log: StepLogger, browser: BrowserAPI) {
     await browser.navigate("https://yoursite.com/login");
     log.success("Navigated");
   }

   export async function fillLogin(log: StepLogger, browser: BrowserAPI, secrets: Secrets) {
     /* ... use secrets.email, secrets.password ... */
   }

   export async function verify(log: StepLogger, browser: BrowserAPI) {
     /* ... */
   }
   ```

   `defineProject` injects the project name into each task, auto-derives `needs` from `secretsSchema`, and generates the `run` function from the `steps` array. The loader discovers projects from `export const project` in `stack/projects/*/project.ts`.

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
├── projects/        # Project-specific task implementations (project.ts per project)
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
