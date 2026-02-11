# Chrome Extension

Bypasses Cloudflare by using a Chrome extension that communicates via WebSocket instead of CDP.

## How It Works

```
┌──────────────┐     WebSocket      ┌─────────────────────┐
│  Node.js     │◀──────────────────▶│  Chrome Extension   │
│  Server      │                    │                     │
│  (main.ts)   │     Commands       │  main.ts            │
└──────────────┘    ──────────▶     └──────────┬──────────┘
                                               │
                                               ▼ DOM APIs
                                    ┌─────────────────────┐
                                    │   Web Page          │
                                    └─────────────────────┘
```

1. Node.js starts a WebSocket server on port 8765
2. Chrome extension connects as a client
3. Server sends commands (navigate, fill, click)
4. Extension executes using standard DOM APIs
5. No CDP = Cloudflare can't detect automation

## Running

```bash
npm run check botcLogin
```

This runs the task in Docker. The extension connects automatically inside the container.

## First-Time Chrome Setup

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select the `dist/extension/` folder
4. Open a new tab (extension needs an active tab)

The server will detect the connection and start automating. In Docker (`npm run check <task>`), this happens automatically.

## Code Layout

Entry point is `service-worker.ts`. Commands live in `messages/commands/`. The WebSocket server is in `stack/browser/browser.ts`.

Available commands are defined as types in `messages/index.ts` — that's the source of truth. Site-specific logic (Turnstile detection, login flows) lives in the tasks layer, not here.

## Why This Works

Cloudflare detects automation by looking for Chrome DevTools Protocol (CDP) usage. This extension:

- Uses standard `chrome.scripting.executeScript()` API
- Manipulates DOM with normal JavaScript
- No CDP connection whatsoever
- Browser fingerprint is unchanged
- Indistinguishable from manual user actions
