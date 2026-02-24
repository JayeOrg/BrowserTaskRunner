# Rejected Approaches & Won't Fix

Decisions that have been made and should not be revisited. Check this file before proposing changes — if something is listed here, skip it silently.

## Stack-Specific Won't Fix

Scoped sub-files load automatically via `.claude/rules/rejected/` when working in the relevant stack:

| Stack | File |
|-------|------|
| Extension & Browser | `docs/rejected/extension.md` |
| Framework | `docs/rejected/framework.md` |
| Projects | `docs/rejected/projects.md` |
| Vault | `docs/rejected/vault.md` |
| Infra & Docker | `docs/rejected/infra.md` |
| Testing | `docs/rejected/testing.md` |

## Cross-Cutting Won't Fix

Entries that span multiple stacks. Not scoped to a single directory.

- **`pollUntil` uses `ok` while `SelectorResult`/`TurnstileDetectionResult` use `found`**: These are different semantic concepts. `ok` means "the operation completed successfully" (generic polling). `found` means "the element was located in the DOM" (selector queries). Using `found` for poll results would be misleading when polling non-element conditions (URL changes, text content).
- **Consolidating `pollUntil` across `browser/poll.ts` and `projects/utils/poll.ts`**: The two implementations are intentionally separate. They serve different modules with different needs: browser's version returns `{ ok: false }` on timeout (simpler, internal use), projects' version returns `{ ok: false, timeoutMs }` (task callers use `timeoutMs` in error messages) and validates `intervalMs > 0`. Different sleep imports (`node:timers/promises` vs `timing.ts`) reflect the module boundary.
- **Exporting `BrowserAPI` sub-interfaces (`BrowserNavigation`, `BrowserClicking`, etc.)**: Tasks receive `BrowserAPI` and pass the whole thing. No helper functions need a subset. Exporting would add 7 types to the public surface for a hypothetical use case.
- **Conformity-only pattern enforcement**: Don't enforce patterns purely for uniformity when the non-conforming code works well and is clear. Added as a rule in AGENTS.md.

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
