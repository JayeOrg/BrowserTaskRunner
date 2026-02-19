---
description: Debug a failing task. Use when a task throws errors, hangs, or produces unexpected results. Covers VNC, logs, and common failure patterns.
---

# Debugging a Task

## Quick checks

1. **Read the error**: The framework logs step name, reason, URL, and details on failure
2. **Check logs**: `logs/` directory contains run output
3. **Run with fast rebuild**: `npm run check <taskName> --no-build` skips Docker build for faster iteration

## Connect via VNC (Docker)

VNC is enabled by default on port 5900:

```bash
npm run check <taskName>
# In another terminal:
open vnc://localhost:5900    # macOS
```

Disable with `--no-vnc` if not needed. VNC lets you watch Chrome in real-time.

## Log files (Docker)

Inside the container, `stack/infra/run.ts` writes:
- `logs/xvfb.log` — X display server
- `logs/chromium.log` — Chrome stderr
- `logs/vnc.log` — VNC server (if enabled)

On exit, the script captures a screenshot and prints the last 20 lines of each log.

## Common failure patterns

### StepError (expected failures)

```
✗ [step-name] Reason here  { url: "...", details: "..." }
```

This is a task calling `logger.fatal()`. The step name tells you where it failed. Check the task file's step function for that name.

### Command timeout (30s default)

```
Command timeout: click (30000ms)
```

The extension didn't respond in time. Causes:
- Selector doesn't exist on the page
- Page is still loading
- Extension disconnected (check chromium.log)
- Element is in an iframe (extension operates on the main frame)

### Connection timeout (60s default)

```
Extension did not connect within 60000ms
```

Chrome didn't connect to the WebSocket server. Causes:
- Extension not loaded (check chrome://extensions)
- Wrong port (WS_PORT mismatch)
- Chrome crashed on startup (check chromium.log)

### waitForSelector returns `found: false`

Not an error by itself — the task decides what to do. If a task depends on finding an element, check:
- Is the selector correct? (inspect the page via VNC)
- Is the page fully loaded? (add a sleep or wait for a different element first)
- Has the site changed its HTML structure?

### Turnstile/Cloudflare issues

- Turnstile iframe loads asynchronously — timing matters
- `cdpClick` bypasses JavaScript event handling (works when regular `click` doesn't)
- Check `querySelectorRect` results — the iframe position may have changed

## Debugging strategies

### Add logging to a task

```typescript
logger.success("Current state", { url, content: html.slice(0, 200) });
```

Use `logger.success()` for non-failing debug output with step tracking.

### Check what the browser sees

```typescript
const { content } = await browser.getContent();
console.log(content.slice(0, 500)); // raw HTML
```

### Check the current URL

```typescript
const { url, title } = await browser.getUrl();
logger.success("Current page", { url, title });
```

### Override retry interval for faster iteration

```bash
SITE_CHECK_INTERVAL_MS=10000 npm run check <taskName>
```

### Run with build skipped (if only task logic changed)

```bash
npm run check <taskName> --no-build
```

## Alert files

On success, the framework writes `logs/alert-<taskName>.txt` with:
- Task name, timestamp, final step, URL
- Also triggers a system bell (BEL character)

If the alert file exists, the task succeeded at least once.
