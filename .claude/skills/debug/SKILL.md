---
description: Debug a failing task. Covers VNC, logs, and common failure patterns.
---

# Debugging a Task

## Quick checks

1. **Read the error**: The framework logs step name, reason, URL, and details on failure
2. **Check logs**: `logs/` directory contains run output
3. **Fast rebuild**: `npm run check <taskName> --no-build` skips Docker build

## VNC (Docker)

VNC is enabled by default on port 5900:

```bash
npm run check <taskName>
# In another terminal:
open vnc://localhost:5900    # macOS
```

Disable with `--no-vnc`. VNC lets you watch Chrome in real-time.

## Log files

Inside the container, `stack/infra/run.ts` writes `logs/xvfb.log`, `logs/chromium.log`, `logs/vnc.log`. On exit, captures a screenshot and prints the last 20 lines of each.

## Common failure patterns

### StepError (expected failures)

```
✗ [step-name] Reason here  { url: "...", details: "..." }
```

A task called `logger.fatal()`. Check the step function matching that step name.

### Command timeout (30s default)

Extension didn't respond. Causes: selector doesn't exist, page still loading, extension disconnected (check chromium.log), element in an iframe.

### Connection timeout (60s default)

Chrome didn't connect to WebSocket. Causes: extension not loaded, port mismatch (`WS_PORT`), Chrome crashed (check chromium.log).

### waitForSelector returns `found: false`

Not an error by itself. Check via VNC: is the selector correct? Is the page loaded? Has the site changed its HTML?

### Turnstile/Cloudflare

Turnstile iframe loads asynchronously. `cdpClick` bypasses JS event handling. Check `querySelectorRect` — iframe position may have changed.

## Debugging strategies

**Add logging**: `logger.success("Current state", { url, content: html.slice(0, 200) });`

**Check browser state**: `const { content } = await browser.getContent();` or `const { url } = await browser.getUrl();`

**Fast iteration**: `SITE_CHECK_INTERVAL_MS=10000 npm run check <taskName>` for shorter retry intervals.

**Skip build**: `npm run check <taskName> --no-build` when only task logic changed.
