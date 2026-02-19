# Chrome Extension

Bypasses Cloudflare by using a Chrome extension that communicates via WebSocket instead of CDP.

## How It Works

```
┌──────────────┐     WebSocket      ┌─────────────────────┐
│  Node.js     │◀──────────────────▶│  Chrome Extension   │
│  Server      │                    │                     │
│ (browser.ts) │     Commands       │  service-worker.ts  │
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

## First-Time Chrome Setup (Local Debugging Only)

> This section is for local debugging without Docker. When running tasks via `npm run check`, the extension loads automatically inside the container.

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select the `dist/extension/` folder
4. Open a new tab (extension needs an active tab)

The server will detect the connection and start automating.

## Code Layout

Entry point is `service-worker.ts`. Commands live in `messages/commands/`. Shared click helpers are in `clicks.ts`. iframe targeting helper is in `script-target.ts`. The WebSocket server is in `stack/browser/browser.ts`.

Available commands are defined as types in `messages/index.ts` — that's the source of truth. Site-specific logic (Turnstile detection, login flows) lives in the tasks layer, not here.

## Available Commands

| Command | Browser Method | Description |
|---------|---------------|-------------|
| `navigate` | `navigate(url)` | Load a URL and wait for page load |
| `getUrl` | `getUrl()` | Get current URL and title |
| `click` | `click(selector, opts?)` | DOM click via synthetic mouse events |
| `cdpClick` | `cdpClick(x, y)` | CDP click at viewport coordinates |
| `fill` | `fill(selector, value, opts?)` | Set input/textarea value |
| `keyboard` | `type(sel, text)`, `press(key)`, `keyDown(key)`, `keyUp(key)` | CDP keyboard input |
| `select` | `selectOption(selector, values, opts?)` | Select dropdown options by value |
| `check` | `check(selector, opts?)`, `uncheck(selector, opts?)` | Toggle checkbox/radio |
| `scroll` | `scrollIntoView(sel, opts?)`, `scrollTo(x, y)`, `scrollBy(x, y)` | Scroll page or element |
| `waitForSelector` | `waitForSelector(selector, timeout?, opts?)` | Poll for element existence |
| `getContent` | `getContent(sel?, opts?)`, `getText(sel?)` | Get text or HTML content |
| `querySelectorRect` | `querySelectorRect(selectors)` | Get element bounding rect |
| `clickText` | `clickText(texts, opts?)` | Find and click element by visible text. Does not support `frameId` — uses coordinate-based clicking which can't target iframes |
| `getFrameId` | `getFrameId(selector)` | Resolve iframe selector to frameId |

Commands marked `opts?` accept `{ frameId?: number }` for iframe targeting. Use `getFrameId()` to resolve an iframe selector to a frameId first.

## Why This Works

Cloudflare detects automation by looking for Chrome DevTools Protocol (CDP) usage. This extension:

- Uses standard `chrome.scripting.executeScript()` API
- Manipulates DOM with normal JavaScript
- No CDP for page navigation or form submission (keyboard input and coordinate clicks use CDP selectively)
- Browser fingerprint is unchanged
- Indistinguishable from manual user actions
