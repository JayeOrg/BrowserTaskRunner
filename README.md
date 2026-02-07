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

    The CLI prompts for the vault password interactively. Save the token from `project create` to `.env`:

    ```bash
    echo "VAULT_TOKEN=<token>" >> .env
    ```

3. Run a task:

    ```bash
    npm run dev -- botcLogin
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

[Full documentation](./stack/infra/README.md)

### Local Development

Runs the Node.js server locally - requires manually loading the extension in Chrome.

```bash
npm run build
npm run dev <taskName>
```

Then load `dist/extension/` as an unpacked extension in Chrome.

[Full documentation](./stack/extension/README.md)

## Adding New Tasks

1. Create a project directory in `stack/projects/yoursite/`:

    ```typescript
    // stack/projects/yoursite/yoursite.ts
    import type { RetryingTask } from "../../framework/tasks.js";

    export const yourSiteTask: RetryingTask = {
        name: "yourSite",
        url: "https://yoursite.com/login",
        project: "monitor-yoursite",
        needs: { email: "email", password: "password" },
        mode: "retry",
        intervalMs: 300_000,
        run: async (browser, context) => {
            await browser.navigate("https://yoursite.com/login");
            // Your login logic here
            return { ok: true, step: "done" };
        },
    };
    ```

2. Register it in `stack/framework/registry.ts`:

    ```typescript
    import { yourSiteTask } from "../projects/yoursite/yoursite.js";

    export const allTasks: TaskConfig[] = [botcLoginTask, yourSiteTask];
    ```

3. Set up vault secrets and run:
    ```bash
    npm run vault -- project create monitor-yoursite
    npm run vault -- detail set monitor-yoursite email user@example.com
    npm run vault -- detail set monitor-yoursite password hunter2
    # Save the token from project create to .env
    npm run dev -- yourSite
    ```

## Project Structure

```
stack/
├── framework/       # Orchestration, types, logging, errors
│   ├── main.ts      # Entry point
│   ├── tasks.ts     # TaskConfig types + registry lookup
│   ├── logging.ts   # Logging infrastructure
│   └── errors.ts    # Result types + StepError
├── projects/        # Project-specific task implementations
│   ├── botc/        # BotC login project
│   └── utils/       # Shared task utilities (selectors, timing)
├── vault/           # Local secrets service (SQLite + AES-256-GCM)
├── browser/         # WebSocket server — typed browser API
│   └── main.ts
├── extension/       # Chrome extension (manifest, messages)
│   └── main.ts
└── infra/           # Docker and deployment
    ├── Dockerfile
    ├── docker-compose.yml
    └── run.sh
```
