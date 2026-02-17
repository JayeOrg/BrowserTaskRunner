# Rejected Approaches & Won't Fix

Decisions that have been made and should not be revisited. Check this file before proposing changes — if something is listed here, skip it silently.

## Won't Fix (DX Review)

Findings considered during DX reviews and intentionally kept as-is. Don't re-raise these.

- **`clicks.ts` CDP fallback logging**: `cdpClickAt` silently falls back to DOM click when CDP attach fails (lines 39, 59). Logging here would be noisy — CDP attach fails routinely when debugger is already attached, and the fallback is intentional. The caller already logs click results.
- **`pollUntil` uses `ok` while `SelectorResult`/`TurnstileDetectionResult` use `found`**: These are different semantic concepts. `ok` means "the operation completed successfully" (generic polling). `found` means "the element was located in the DOM" (selector queries). Using `found` for poll results would be misleading when polling non-element conditions (URL changes, text content). Pending further review of whether to standardize.
- **`browser.ts` helper type `ClickTextOptions` is not exported**: It's an implementation detail of the BrowserAPI interface, only used as a parameter type. Callers construct it as an object literal — exporting would suggest it's meant to be referenced by name.
- **Magic numbers in `TIMINGS` constants**: Values like `3000`, `5000`, `10000` in task timing constants are empirical — they were tuned against the real sites. Naming them more descriptively (e.g., `SLOW_PAGE_LOAD`) wouldn't add clarity since the appropriate delay depends on the site's behavior, not on a category.
- **`vault/core.ts` string template for SQL**: The query strings use template literals with `$paramName` placeholders (not JS interpolation). This is safe — node:sqlite uses parameterized queries. Don't flag as SQL injection risk.
- **Extension `log()` function is minimal**: It's a `console.log` wrapper with a prefix. Don't suggest replacing with a logging library — this runs in a Chrome service worker where simplicity matters more than features.
- **`browser.ts` method named `type` clashes with TS keyword culture**: `type` is the standard name used by Playwright and Puppeteer. Renaming would confuse anyone coming from those frameworks.
- **`cdpClickSelector` naming compounds mechanism and input strategy**: Matches the established `cdp` + action pattern used by `cdpClick`. The name clearly signals "CDP click, resolved by selector."
- **`stepFailed` flag in `step-runner.ts` is redundant with pointer check**: Explicit and easy to read. The redundancy makes intent clear — "don't advance on failure" is stated directly rather than inferred from pointer state.
- **`clickSignIn` in nandosOrder.ts uses CDP click on submit button**: Nandos sign-in page is not behind a Cloudflare challenge — the Turnstile handling only appears on certain pages. CDP click works here and is intentional.
- **`PingCommand` and `GetUrlCommand` are manually typed instead of schema-derived**: Their schemas are `z.object({})` which infers to `Record<string, never>` — combining this with `& { type: "ping" }` creates an impossible type because the `type` key conflicts with the `never` index signature. Manual typing is correct here.
- **`getReconnectDelay` in `connection.ts` has an intermediate variable**: One line — the extra variable makes debugging easier (breakpoint on the return). Inlining saves nothing meaningful.
- **`needs` is explicit, not derived from `contextSchema`**: An earlier approach silently derived `needs` from `contextSchema` keys when `needs` was omitted. This was reverted because it's a hidden side effect — defining a schema shouldn't silently configure vault loading. The `contextSchema` validates shape/types; `needs` maps vault keys. They overlap in the common case but serve different purposes. Use `needsFromSchema(schema)` to reduce repetition explicitly: `needs: needsFromSchema(contextSchema)`.
- **`StepUpdate.state` includes "idle"**: The "idle" state in the overlay's `StepUpdate` type is the overlay's initial rendering state before any step update arrives from StepRunner. StepRunner never emits "idle" — it's a client-side-only concept for the overlay's pre-update display. Removing it would leave the overlay with no state before the first step begins.
- **`PrefixLogger` and `StepLogger` have different interfaces**: `PrefixLogger` has `.log()/.warn()/.error()/.success()` while `StepLogger` (TaskLogger) has `.info()/.warn()/.fail()`. These serve different contexts — framework-level logging vs step-scoped logging with structured failure semantics. Unifying them would compromise the step logger's purpose-built API.
- **Gate double-await pattern in `step-runner.ts`**: `await this.gate.wait(); await this.gate.wait();` looks redundant but is correct. The first wait blocks until the gate opens (play). The second wait handles the case where the gate closes again immediately (pause between steps). Both awaits are needed for the pause/play/skip control flow.
- **Infinite retry loop in `run.ts`**: `while (true)` in `runWithRetry` is intentional. The task is designed to keep retrying until success or a fatal (non-StepError) error. StepErrors are expected failures (site not available, element not found) — the framework logs them and tries again after a configurable interval. A max-retry limit would defeat the monitoring purpose.
- **`terminate` vs `close` naming in `browser.ts`**: `close()` cleanly shuts down the WebSocket server. A separate `terminate()` for force-close was suggested but isn't needed — `close()` already handles the shutdown path, and there's no scenario where a graceful close fails that a force-terminate would solve.
- **`pollUntil` doesn't expose `lastValue` on timeout**: When `pollUntil` times out, it throws without returning the last polled value. The caller typically only cares about success (the resolved value) or failure (the timeout). Adding `lastValue` to the error would complicate the API for a debugging-only benefit — callers can log intermediate values in their poll function if needed.
- **No schema version in vault SQLite**: The vault schema is created by `initSchema()` and has no version column or migration system. The schema is simple (4 tables) and changes infrequently. A version/migration system would add complexity disproportionate to the schema's stability. If a breaking change is needed, a fresh vault can be created.
- **`resolveAdminAuth` silently clears invalid tokens from `.env`**: When `VAULT_ADMIN` contains a wrong-type token (32-byte project token instead of 48-byte session token) or an expired session, `resolveAdminAuth` removes it from `.env` and falls back to password prompt. This is intentional self-healing — the stderr message explains what happened, and re-prompting is better UX than failing with an opaque error.
- **Unicode checkmarks in logging output**: `PrefixLogger.success()` uses `✓` and other formatters use Unicode symbols. These display correctly in Docker logs, terminal output, and CI. ASCII alternatives would be less readable.

## Failed Approaches

### Cloudflare Bypass

All approaches below share one fatal flaw: **they all use CDP to control the browser**. Cloudflare detects CDP through `navigator.webdriver`, missing/modified `window.chrome` properties, CDP-specific JS execution patterns, TLS fingerprint differences, and network request timing.

**What actually works**: Chrome Extension (runs as normal JS, no automation protocol) communicating via WebSocket.

1. **Playwright with Stealth Plugin** — Still detected. Stealth plugin hides some automation markers but CDP connection is still detectable.
2. **Installed Chrome instead of bundled Chromium** — Still detected. The browser executable doesn't matter — CDP connection is the issue.
3. **Chrome persistent context (user profile)** — Still detected. Even with real cookies/history, CDP connection gives it away.
4. **Firefox via Playwright** — Failed. Playwright's Firefox is a modified Nightly build; system Firefox can't be used (requires Juggler protocol).
5. **rebrowser-patches** — Patch failed, incompatible with Playwright 1.58.1.
6. **Human-like behavior simulation** (random mouse movements, typing delays, scroll patterns) — Still detected. Behavioral simulation doesn't help if CDP connection is already flagged.
7. **`--disable-blink-features=AutomationControlled`** — Still detected. This flag is well-known and Cloudflare checks for more.
8. **Custom User Agent** — Still detected. Easy to spoof but CDP connection is still there.

### Architecture

9. **Remote code execution via `unsafe-eval` CSP** — Extension loads fine with this CSP, but rejected because: debugging is harder (opaque stack traces), no type safety (code strings bypass TS), marginal benefit (primitive-based approach already achieves clean separation), security surface (`unsafe-eval` is a code smell), and maintenance burden (DOM code as strings is harder to refactor).

10. **Host-side polling for `waitForSelector`** — Replace in-page polling with host-side WebSocket round-trips. Rejected because: latency doubles (20-50ms per hop), WebSocket traffic scales with timeout (50x more messages for 10s wait), navigation during `waitForSelector` is a task design bug (not a primitive issue), current error is actionable, and a simpler fix (beforeunload listener) is available if needed.

11. **Connection status chip in debug overlay** — Rejected because: requires cross-context messaging (content script ↔ service worker), connection failures are already loud (`Browser.start()` throws), Docker is single-tab (no ambiguity about which endpoint), and the service worker console already logs connection state.
