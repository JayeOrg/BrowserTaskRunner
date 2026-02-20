# Browser & Extension

WebSocket bridge between the framework and the Chrome extension. Tasks interact with Chrome through the `Browser` class; the extension executes commands using standard DOM APIs to bypass Cloudflare detection.

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
  (stack/browser/)
```

1. `Browser.start()` launches a WebSocket server and waits for the extension to connect
2. Tasks call convenience methods (`navigate`, `click`, `fill`, etc.)
3. Each call sends a typed JSON command and awaits the extension's response
4. Extension executes using standard DOM APIs — no CDP for navigation or form submission

## Why This Works

Cloudflare detects automation by looking for Chrome DevTools Protocol (CDP) usage. The extension:

- Uses standard `chrome.scripting.executeScript()` API
- Manipulates DOM with normal JavaScript
- No CDP for page navigation or form submission (keyboard input and coordinate clicks use CDP selectively)
- Browser fingerprint is unchanged — indistinguishable from manual user actions

## Configuration

The `Browser` constructor accepts an optional `BrowserOptions` object:

| Option               | Default | Description                                    |
| -------------------- | ------- | ---------------------------------------------- |
| `commandTimeoutMs`   | 30000   | Timeout per command (navigate, click, etc.)     |
| `connectionTimeoutMs`| 60000   | How long `start()` waits for extension to connect |
| `pauseOnError`       | —       | Passed to StepRunner (which defaults to `true`)  |

## Running

```bash
npm run check botcLogin
```

The extension connects automatically inside the Docker container.

## Browser API

See the `BrowserAPI` interface in `browser.ts` for available methods and signatures. Methods marked with `IframeOption` accept `{ frameId?: number }` for iframe targeting — use `getFrameId()` to resolve an iframe selector to a frameId first.

## Extension Wire Commands

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

## Files

**Browser** (`stack/browser/`):
- `browser.ts` — `Browser` class with WebSocket server and all browser commands
- `poll.ts` — Polling utility for browser-side operations

**Extension** (`stack/extension/`):
- `service-worker.ts` — Entry point
- `messages/commands/` — Command handlers
- `messages/index.ts` — Command/response type unions (source of truth for available commands)
- `clicks.ts` — Shared click helpers
- `script-target.ts` — iframe targeting helper (`getScriptTarget`)

## Design Decisions

### Connection drops are fatal

When the WebSocket connection to the extension drops, all pending commands are immediately rejected with `"Extension disconnected"` and subsequent commands throw `"Extension not connected"`. There is no automatic reconnection.

**Rationale:** A disconnect typically means Chrome or the extension crashed. Rather than masking this with reconnection attempts inside Browser, the error propagates to the framework, which owns retry logic.

### Extension implementation details

**`script-results.ts` uses Zod `safeParse()` intentionally.** Don't replace with manual `typeof` guards. The schemas are the single source of truth for both types (`z.infer`) and runtime validation — manual guards would drift. `ScriptFoundSchema` has nested optionals that make manual checks verbose and error-prone. These run once per command (not a hot loop), so allocation cost is irrelevant. And `executeScript` results run in the page's JS context, so they're not fully "trusted internal data."

**`chrome.scripting.executeScript` args gotcha**: Chrome cannot serialize `undefined` in the `args` array — it throws `"Value is unserializable"` at runtime. When a Zod schema has optional fields (e.g. `selector: z.string().optional()`), the parsed value is `undefined` when omitted. Always coalesce to a concrete value before passing: `args: [input.selector ?? null, input.html ?? false]`.

**Command handler exhaustiveness.** `commandHandlers` in `messages/index.ts` uses `satisfies Record<CommandMessage["type"], CommandHandler>` so adding a new command type without a handler is a compile error. `IncomingCommand` stays loose as a wire format; zod schemas validate at runtime.

**`isResponseMessage` is intentionally loose.** It checks structure (`{type: string}`), not known type values. The narrowing is technically unsound but harmless — `handleResponse` drops unrecognized IDs. Validating against known types would duplicate the `ResponseMessage` union.

**Zero-size rect defense.** `cdpClickSelector` returns `found: false` for elements with zero-width/height bounding rects. Hidden/detached elements (e.g. modals still in DOM) report zero-size rects — clicking their center would land at (0,0), hitting the wrong target.

**iframe support.** Commands that use `executeScript` accept an optional `frameId` parameter for targeting iframes. Use `browser.getFrameId("iframe.selector")` to resolve an iframe element to its frameId, then pass it to other commands: `browser.click("#btn", { frameId })`. The `getScriptTarget(frameId?)` helper in `script-target.ts` builds the correct `executeScript` target object. Commands not supporting frameId: `cdpClick` (viewport-level), `clickText` (coordinate-based), `navigate`/`getUrl` (tab-level).

**Keyboard input uses CDP.** The `keyboard` command uses `chrome.debugger` for `Input.insertText` (type action) and `Input.dispatchKeyEvent` (press/down/up actions). Unlike `cdpClick`, keyboard has no DOM fallback — if debugger attach fails, it returns an error. The `type` method focuses the element first via `executeScript`, then uses CDP `Input.insertText` for efficient single-call text insertion.

## First-Time Chrome Setup (Local Debugging Only)

> This section is for local debugging without Docker. When running tasks via `npm run check`, the extension loads automatically inside the container.

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select the `dist/extension/` folder
4. Open a new tab (extension needs an active tab)
