# SiteCheck - Cloudflare Bypass Solutions

A collection of solutions for automating login to Cloudflare-protected sites.

## The Problem

Cloudflare detects browser automation tools (Playwright, Puppeteer, Selenium) via the Chrome DevTools Protocol (CDP). See [FAILED_APPROACHES.md](./FAILED_APPROACHES.md) for details on what doesn't work.

## Solutions

### 1. Chrome Extension (Interactive)

Uses a Chrome extension that communicates via WebSocket. No CDP = no detection.

**Pros:** Works reliably, bypasses Cloudflare
**Cons:** Requires visible Chrome window

```bash
npm run extension
```

Then load the extension from `stack/extension/extension/` in Chrome.

[Full documentation](./stack/extension/README.md)

---

### 2. Docker (Headless Background)

Runs Chrome + extension inside a Docker container with virtual display.

**Pros:** Fully headless, isolated, runs in background
**Cons:** Requires Docker

```bash
npm run docker:up
```

[Full documentation](./stack/docker/README.md)

---

### 3. HTTP Monitor (Simple Check)

Simple HTTP-based monitoring. Doesn't bypass Cloudflare, just checks if the site is responding.

**Pros:** Lightweight, no browser needed
**Cons:** Can't bypass Cloudflare or login

```bash
npm run monitor
```

---

## Configuration

Set these environment variables (or create a `.env` file):

```bash
BOTC_EMAIL=your-email@example.com
BOTC_PASSWORD=your-password
BOTC_LOGIN_URL=https://botc.app/
BOTC_CHECK_INTERVAL_MS=300000  # 5 minutes
```

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file with credentials

3. Choose a solution:
   - Interactive: `npm run extension`
   - Background: `npm run docker:up`
   - Monitor only: `npm run monitor`
