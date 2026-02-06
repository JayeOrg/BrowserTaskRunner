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

2. Create `.env` file with your credentials:

    ```bash
    # Required
    SITE_EMAIL=your-email@example.com
    SITE_PASSWORD=your-password

    # Optional
    SITE_CHECK_INTERVAL_MS=300000  # 5 minutes (default)
    ```

3. Run a task:

    ```bash
    # Docker (recommended - fully headless)
    npm run check botcLogin

    # Local development
    npm run dev botcLogin
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

1. Create a task in `stack/tasks/yoursite.ts`:

    ```typescript
    import { TaskConfig } from "../engine/tasks.js";

    export const yourSiteTask: TaskConfig = {
        name: "yourSite",
        url: "https://yoursite.com/login",
        run: async (browser, context) => {
            await browser.navigate("https://yoursite.com/login");
            // Your login logic here
            return { ok: true, step: "done" };
        },
    };
    ```

2. Register it in `stack/engine/registry.ts`:

    ```typescript
    import { yourSiteTask } from "../tasks/yoursite.js";

    const tasks: Record<string, TaskConfig> = {
        botcLogin: botcLoginTask,
        yourSiteLogin: yourSiteTask, // Add here
    };
    ```

3. Run it:
    ```bash
    npm run check yourSiteLogin
    ```

## Project Structure

```
stack/
├── engine/          # Generic task orchestration
│   ├── main.ts      # Entry point
│   └── tasks.ts     # Task registry + TaskConfig
├── tasks/           # Site-specific task implementations
│   ├── botc.ts      # BotC login task
│   └── utils/       # Shared task utilities (selectors, timing)
├── common/          # Shared utilities (logging, errors, result types)
├── browser/         # WebSocket server — typed browser API
│   └── main.ts
├── extension/       # Chrome extension (manifest, messages)
│   └── main.ts
└── infra/           # Docker and deployment
    ├── Dockerfile
    ├── docker-compose.yml
    └── run.sh
```
