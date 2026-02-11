# SiteCheck

Automated login checker for sites with human verification (Cloudflare Turnstile, etc).

## The Problem

Cloudflare detects browser automation tools (Playwright, Puppeteer, Selenium) via the Chrome DevTools Protocol (CDP). See [FAILED_APPROACHES.md](./FAILED_APPROACHES.md) for details on what doesn't work.

## Solution

Uses a Chrome extension that communicates via WebSocket. No CDP = no detection.

## Quick Start

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

| Task        | URL               | Description             |
| ----------- | ----------------- | ----------------------- |
| `botcLogin` | https://botc.app/ | Login flow for botc.app |

## Running Modes

### Docker (Headless)

Runs Chrome + extension inside a Docker container with virtual display.

```bash
npm run check <taskName>
```

To debug with VNC:

```bash
ENABLE_VNC=true npm run check botcLogin
# Connect VNC viewer to localhost:5900
```

To iterate quickly using a local build (mounts `./dist` into the container instead of rebuilding the image):

```bash
npm run check botcLogin --host-dist
```

[Full documentation](./stack/infra/README.md)

[Extension documentation](./stack/extension/README.md)

## Adding New Tasks

1. Create a project directory in `stack/projects/yoursite/`:

    ```typescript
    // stack/projects/yoursite/tasks/yoursite.ts
    import type { RetryingTask } from "../../../framework/tasks.js";

    export const yourSiteTask: RetryingTask = {
        name: "yourSite",
        url: "https://yoursite.com/login",
        project: "monitor-yoursite",
        needs: ["email", "password"],
        mode: "retry",
        intervalMs: 300_000,
        run: async (browser, context, logger) => {
            await browser.navigate("https://yoursite.com/login");
            // Your login logic here
            return { ok: true, step: "done" };
        },
    };
    ```

2. Register it in `stack/framework/registry.ts`:

    ```typescript
    import { yourSiteTask } from "../projects/yoursite/tasks/yoursite.js";

    export const allTasks: TaskConfig[] = [botcLoginTask, yourSiteTask];
    ```

3. Set up vault secrets and run:
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
│   ├── registry.ts  # Task registry
│   ├── logging.ts   # Logging infrastructure
│   └── errors.ts    # Result types + StepError
├── projects/        # Project-specific task implementations
│   ├── botc/        # BotC login project
│   └── utils/       # Shared task utilities (selectors, timing, polling)
├── vault/           # Local secrets service (SQLite + AES-256-GCM)
├── browser/         # WebSocket server — typed browser API
│   └── browser.ts
├── extension/       # Chrome extension (manifest, messages)
│   └── service-worker.ts
└── infra/           # Docker and deployment
    ├── Dockerfile
    ├── docker-compose.yml
    └── run.sh
```

## Alerts

Task results are written to `logs/alert-<taskName>.txt`. On success, the terminal bell is triggered as an audible notification.
