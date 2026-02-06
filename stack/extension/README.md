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

## Local Development Setup

1. Build the project:
   ```bash
   npm run build
   ```

2. Run the server with a task:
   ```bash
   npm run dev botcLogin
   ```

3. Open Chrome and go to `chrome://extensions`

4. Enable "Developer mode" (toggle in top right)

5. Click "Load unpacked"

6. Select the `dist/extension/` folder

7. Open a new tab (extension needs an active tab)

8. The server will detect the connection and start automating

## Files

- `../host/main.ts` - WebSocket server, sends commands to extension
- `manifest.json` - Extension configuration
- `main.ts` - WebSocket client, executes commands

## Available Commands

The extension supports these generic commands via WebSocket:

| Command              | Description                                      |
| -------------------- | ------------------------------------------------ |
| `navigate`           | Navigate to a URL                                |
| `fill`               | Fill an input field                              |
| `click`              | Click an element (via DOM events)                |
| `cdpClick`           | Click at coordinates (via CDP, with JS fallback) |
| `waitForSelector`    | Wait for an element to appear                    |
| `querySelectorRect`  | Get bounding rect for first matching selector    |
| `getUrl`             | Get current page URL                             |
| `getContent`         | Get page text content                            |
| `ping`               | Test connection                                  |

Note: Site-specific logic (Turnstile detection, login flows) lives in the tasks layer, not here.

## Why This Works

Cloudflare detects automation by looking for Chrome DevTools Protocol (CDP) usage. This extension:

- Uses standard `chrome.scripting.executeScript()` API
- Manipulates DOM with normal JavaScript
- No CDP connection whatsoever
- Browser fingerprint is unchanged
- Indistinguishable from manual user actions
