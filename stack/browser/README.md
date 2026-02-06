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

1. `Browser.start()` launches a WebSocket server and waits for the extension to connect (60s timeout)
2. Tasks call convenience methods (`navigate`, `click`, `fill`, etc.)
3. Each call sends a typed JSON command and awaits the extension's response (30s timeout)

## Files

- `main.ts` - `Browser` class with WebSocket server and all browser commands
- `instructions.ts` - Logs connection setup instructions on startup

## API

Tasks receive a `Browser` instance and use these methods:

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
