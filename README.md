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

Then load `dist/extension/client/` as an unpacked extension in Chrome.

[Full documentation](./stack/extension/README.md)

## Adding New Tasks

1. Create a task in `stack/behaviour/sites/yoursite.ts`:

    ```typescript
    import { TaskConfig } from "../types.js";

    export const yourSiteTask: TaskConfig = {
        name: "yourSite",
        url: "https://yoursite.com/login",
        run: async (host, creds) => {
            await host.navigate("https://yoursite.com/login");
            // Your login logic here
            return true; // Return true on success
        },
    };
    ```

2. Register it in `stack/behaviour/tasks.ts`:

    ```typescript
    import { yourSiteTask } from "./sites/yoursite.js";

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
├── behaviour/       # Task logic and site-specific flows
│   ├── sites/       # Site-specific login implementations
│   ├── tasks.ts     # Task registry
│   ├── types.ts     # Shared types
│   └── run-task.ts # Main entry point
├── extension/       # Chrome extension
│   ├── client/      # Extension source (manifest, background, messages)
│   └── host.ts      # WebSocket server for extension communication
└── infra/           # Docker and deployment
    ├── Dockerfile
    ├── docker-compose.yml
    └── start.sh
```
