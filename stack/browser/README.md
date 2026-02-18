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
| `pauseOnError`       | —       | Passed to StepRunner (which defaults to `true`)  |

## Files

- `browser.ts` - `Browser` class with WebSocket server and all browser commands

## API

Tasks receive a `BrowserAPI` instance and use these methods:

| Method                                | Description                                    |
| ------------------------------------- | ---------------------------------------------- |
| `navigate(url)`                       | Navigate to a URL                              |
| `getUrl()`                            | Get current page URL and title                 |
| `fill(selector, value, opts?)`        | Fill an input field                            |
| `click(selector, opts?)`              | Click an element via DOM events                |
| `cdpClick(x, y)`                      | Click at viewport coordinates via CDP          |
| `clickText(texts, opts?)`             | Find and click element by visible text         |
| `cdpClickSelector(selectors)`         | Resolve selector to rect, then CDP click       |
| `waitForSelector(sel, timeout, opts?)`| Wait for an element to appear                  |
| `waitForText(texts, timeout?)`        | Poll page text for any matching string         |
| `waitForUrl(pattern, timeout?)`       | Poll URL until it contains pattern             |
| `getContent(selector?, opts?)`        | Get page text or HTML content                  |
| `getText(selector?)`                  | Shorthand for `getContent().content`           |
| `querySelectorRect(selectors)`        | Get bounding rect for first match              |
| `type(selector, text)`                | CDP keyboard text insertion                    |
| `press(key)`                          | CDP key press (down + up)                      |
| `keyDown(key)`                        | CDP key down                                   |
| `keyUp(key)`                          | CDP key up                                     |
| `selectOption(selector, values, opts?)`| Select dropdown options by value              |
| `check(selector, opts?)`              | Check a checkbox/radio                         |
| `uncheck(selector, opts?)`            | Uncheck a checkbox/radio                       |
| `scrollIntoView(selector, opts?)`     | Scroll element to viewport center              |
| `scrollTo(x, y)`                      | Absolute page scroll                           |
| `scrollBy(x, y)`                      | Relative page scroll                           |
| `getFrameId(selector)`                | Resolve iframe selector to frameId             |

## Design Decisions

### Connection drops are fatal

When the WebSocket connection to the extension drops, all pending commands are immediately rejected with `"Extension disconnected"` and subsequent commands throw `"Extension not connected"`. There is no automatic reconnection.

**Rationale:** A disconnect typically means Chrome or the extension crashed. Rather than masking this with reconnection attempts inside Browser, the error propagates to the framework, which owns retry logic. The framework can then decide whether to restart the entire process.

**If reconnection is needed later:** Add it here — either as a `reconnect: boolean` option in the Browser constructor, or by having the framework create a new Browser instance per retry attempt.
