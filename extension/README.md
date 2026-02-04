# Chrome Extension Solution

Bypasses Cloudflare by using a Chrome extension that communicates via WebSocket instead of CDP.

## How It Works

```
┌──────────────┐     WebSocket      ┌─────────────────────┐
│  Node.js     │◀──────────────────▶│  Chrome Extension   │
│  Server      │                    │                     │
│  (index.js)  │     Commands       │  background.js      │
└──────────────┘    ──────────▶     │  content.js         │
                                    └──────────┬──────────┘
                                               │
                                               ▼ DOM APIs
                                    ┌─────────────────────┐
                                    │   Web Page          │
                                    │   (botc.app)        │
                                    └─────────────────────┘
```

1. Node.js starts a WebSocket server
2. Chrome extension connects as a client
3. Server sends commands (navigate, fill, click)
4. Extension executes using standard DOM APIs
5. No CDP = Cloudflare can't detect automation

## Setup

1. Run the server:
   ```bash
   npm run extension
   ```

2. Open Chrome and go to `chrome://extensions`

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked"

5. Select the `extension/extension/` folder inside this directory

6. Open a new tab (extension needs an active tab)

7. The server will detect the connection and start automating

## Files

- `index.js` - Node.js WebSocket server and automation logic
- `extension/manifest.json` - Extension configuration
- `extension/background.js` - WebSocket client, executes commands
- `extension/content.js` - Content script (minimal)

## Why This Works

Cloudflare detects automation by looking for Chrome DevTools Protocol (CDP) usage. This extension:

- Uses standard `chrome.scripting.executeScript()` API
- Manipulates DOM with normal JavaScript
- No CDP connection whatsoever
- Browser fingerprint is unchanged
- Indistinguishable from manual user actions
