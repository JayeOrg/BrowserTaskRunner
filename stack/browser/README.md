# Browser

WebSocket server that bridges the framework and the Chrome extension. Tasks interact with Chrome through the `Browser` class.

## How It Works

```
┌──────────────┐     WebSocket      ┌─────────────────────┐
│  Framework   │────────────────────▶│  Chrome Extension   │
│              │◀────────────────────│                     │
│  (tasks)     │   send() / respond  │  (DOM automation)   │
└──────────────┘                    └─────────────────────┘
        │
        ▼
  Browser class
  (this module)
```

1. `Browser.start()` launches a WebSocket server and waits for the extension to connect
2. Tasks call convenience methods (`navigate`, `click`, `fill`, etc.)
3. Each call sends a typed JSON command and awaits the extension's response

## Configuration

The `Browser` constructor accepts an optional `BrowserOptions` object:

| Option               | Default | Description                                    |
| -------------------- | ------- | ---------------------------------------------- |
| `commandTimeoutMs`   | 30000   | Timeout per command (navigate, click, etc.)     |
| `connectionTimeoutMs`| 60000   | How long `start()` waits for extension to connect |

## Files

- `browser.ts` - `Browser` class with WebSocket server and all browser commands
- `instructions.ts` - Logs connection setup instructions on startup

## API

Tasks receive a `BrowserAPI` instance and use these methods:

| Method                        | Description                            |
| ----------------------------- | -------------------------------------- |
| `navigate(url)`               | Navigate to a URL                      |
| `getUrl()`                    | Get current page URL and title         |
| `fill(selector, value)`       | Fill an input field                    |
| `click(selector)`             | Click an element via DOM events        |
| `cdpClick(x, y)`              | Click at coordinates                   |
| `waitForSelector(sel, timeout)` | Wait for an element to appear        |
| `getContent(selector?)`       | Get page text content                  |
| `querySelectorRect(selectors)` | Get bounding rect for first match     |
| `ping()`                      | Test connection                        |

## Design Decisions

### Connection drops are fatal

When the WebSocket connection to the extension drops, all pending commands are immediately rejected with `"Extension disconnected"` and subsequent commands throw `"Extension not connected"`. There is no automatic reconnection.

**Rationale:** A disconnect typically means Chrome or the extension crashed. Rather than masking this with reconnection attempts inside Browser, the error propagates to the framework, which owns retry logic. The framework can then decide whether to restart the entire process.

**If reconnection is needed later:** Add it here — either as a `reconnect: boolean` option in the Browser constructor, or by having the framework create a new Browser instance per retry attempt.
