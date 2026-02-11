# Failed Approaches to Bypass Cloudflare

This documents all the approaches we tried that did NOT work for bypassing Cloudflare Turnstile detection.

## Root Cause

Cloudflare detects the **Chrome DevTools Protocol (CDP)** that Playwright/Puppeteer use to control the browser. This detection happens at multiple levels:

- TLS/JA3 fingerprinting
- CDP-specific JavaScript properties
- Automation flags in the browser
- Behavioral analysis

## Failed Approaches

### 1. Playwright with Stealth Plugin

```bash
npm install playwright-extra puppeteer-extra-plugin-stealth
```

**Result**: Still detected. Stealth plugin hides some automation markers but CDP connection is still detectable.

### 2. Using Installed Chrome Instead of Bundled Chromium

```javascript
executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
```

**Result**: Still detected. The browser executable doesn't matter - CDP connection is the issue.

### 3. Using User's Chrome Profile (Persistent Context)

```javascript
chromium.launchPersistentContext(userDataDir, {...})
```

**Result**: Still detected. Even with real cookies/history, CDP connection gives it away.

### 4. Firefox via Playwright

```javascript
import { firefox } from "playwright";
```

**Result**: Failed for multiple reasons:

- Playwright's Firefox is a modified "Nightly" build
- System Firefox can't be used (requires Playwright's Juggler protocol)

### 5. rebrowser-patches

```bash
npm install rebrowser-patches
npx rebrowser-patches patch --packageName playwright-core
```

**Result**: Patch failed - incompatible with Playwright 1.58.1.

### 6. Human-Like Behavior Simulation

- Random mouse movements
- Typing delays
- Scroll patterns
- Variable wait times

**Result**: Still detected. Behavioral simulation doesn't help if CDP connection is already flagged.

### 7. Browser Args to Disable Automation

```javascript
args: ["--disable-blink-features=AutomationControlled"];
```

**Result**: Still detected. This flag is well-known and Cloudflare checks for more than just this.

### 8. Custom User Agent

```javascript
userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...";
```

**Result**: Still detected. User agent is easy to spoof but CDP connection is still there.

## Why These All Fail

All these approaches share one fatal flaw: **they all use CDP to control the browser**.

Cloudflare can detect CDP through:

1. `navigator.webdriver` property (even when spoofed)
2. Missing/modified `window.chrome` properties
3. CDP-specific JavaScript execution patterns
4. TLS fingerprint differences
5. Network request timing patterns

## What Actually Works

The only way to avoid detection is to **not use CDP at all**:

1. **Chrome Extension** - Runs as normal JavaScript, no automation protocol
2. **AppleScript/osascript** - Native macOS automation, no browser-level detection

## Current Solution

We're implementing a **Chrome Extension approach** that:

- Communicates via WebSocket (not CDP)
- Executes commands using standard DOM APIs
- Is completely invisible to Cloudflare

### 9. Remote Code Execution via unsafe-eval CSP

**Approach**: Add `unsafe-eval` to the extension's CSP to allow `executeScript` to send code strings from behavior layer and execute them via `new Function(code)`.

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'unsafe-eval'; object-src 'self'"
}
```

**Result**: Technically works - extension loads and runs fine with this CSP. However, not worth pursuing.

**Why we rejected it**:

1. **Debugging is significantly harder** - Stack traces from eval'd code are opaque, breakpoints don't work, and errors point to generated code rather than source files

2. **No type safety** - Code strings bypass TypeScript entirely. Typos in selectors or API calls become runtime errors instead of compile-time errors

3. **Marginal benefit** - The current primitive-based approach (`click(selector)`, `fill(selector, value)`) already achieves clean separation. Behavior owns *what* to click, extension owns *how* to click. Moving the "how" to behavior gains little

4. **Security surface** - `unsafe-eval` is a code smell even for unpublished extensions. If any part of the behavior layer is compromised, it becomes an arbitrary code execution vector

5. **Maintenance burden** - DOM manipulation code as strings is harder to refactor, search, and maintain than typed functions

**Conclusion**: Keep the typed primitive approach. Extension provides generic commands (`click`, `fill`, `waitForSelector`, `cdpClick`, `querySelectorRect`), behavior provides the parameters. This is the right level of abstraction.

### 10. Host-side polling for waitForSelector

**Approach**: Replace the in-page polling loop (`chrome.scripting.executeScript` with a `while` loop and 100ms sleeps) with host-side polling from `browser.ts`. The server would loop, sending individual "does this selector exist?" checks via WebSocket. Each check would be a fresh `executeScript` call.

**Motivation**: If the page navigates while the in-page script is running, Chrome kills the injected script context. `executeScript` returns `undefined`, producing a generic error. The host-side approach survives navigation because each poll is independent.

**Why we rejected it**:

1. **Latency doubles at minimum** — each poll round-trips through WebSocket (JSON serialize → send → extension receives → executeScript → response → JSON serialize → send back), conservatively 20-50ms per hop. Safe intervals would be 200ms+ vs the current 100ms in-page poll. For elements that appear quickly after page load, this matters.

2. **WebSocket traffic scales with timeout** — a 10-second wait at 200ms intervals = 50 WebSocket messages vs the current 1 out, 1 back. Localhost so bandwidth is fine, but 50x more message handling, logging, and JSON parsing.

3. **Navigation during waitForSelector is a task design bug** — the pattern is "navigate → wait for load → waitForSelector". If a redirect happens during the wait, the task's assumptions about what page it's on are already broken. The right fix is in the task (handle the redirect), not in the primitive.

4. **The current error is actionable** — "Script execution failed for selector: X" tells you the wait was interrupted. Tasks handle this by checking `.found` and retrying at the task level.

5. **Simpler fix available if needed** — register a `beforeunload` listener in the injected script and return `{ found: false, navigated: true }` before teardown. One line, no architecture change.

### 11. Connection status chip in debug overlay

**Approach**: Add a small indicator to the debug overlay showing WebSocket connection state ("WS: connected to localhost:8765" or "WS: disconnected").

**Why we rejected it**:

1. **Cross-context messaging required** — the overlay runs as a content script, WebSocket state lives in the service worker. Needs: (a) service worker pushing connection state changes via `chrome.tabs.sendMessage`, (b) overlay listening and rendering, (c) overlay polling on load for initial state. That's a new message type, a new cached value, a new handler — all for a status indicator.

2. **Connection failures are loud, not subtle** — if the WS isn't connected, `Browser.start()` throws "Extension did not connect within 60 seconds" and the task never starts. You never end up staring at the overlay wondering about connection state.

3. **Docker single-tab environment** — no scenario where you're in the container wondering which WS endpoint you're connected to. One server, one port.

4. **Service worker console is the right tool** — `chrome://extensions` → inspect service worker already logs `[HH:MM:SS SiteCheck] Connected to server` and `Disconnected from server` with timestamps.
