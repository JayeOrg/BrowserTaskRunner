---
description: Add tests for a module. Use when writing unit, integration, or e2e tests. Covers test placement, mocking patterns, and vitest conventions.
---

# Adding Tests

Tests live in `tests/` mirroring the module they test. Vitest config: `vitest.config.ts`.

## Where tests go

| Module | Test location | Style |
|--------|--------------|-------|
| `stack/framework/*` | `tests/unit/framework/` | Unit — pure functions, fake timers |
| `stack/vault/ops/*`, `stack/vault/core.ts` | `tests/unit/vault/vault.test.ts` | Unit — real SQLite, SAVEPOINT isolation |
| `stack/vault/cli/*` | `tests/unit/vault/vault-manage.test.ts` | CLI integration — spawned `node` process |
| `stack/projects/utils/*` | `tests/unit/projects/utils/` | Unit — mock browser |
| `stack/browser/*` | `tests/integration/browser/` | Integration — fake WebSocket extension |
| `stack/projects/*/tasks/*` | `tests/e2e/projects/` | E2E — full task run with fake site |

The extension (`stack/extension/`) runs in Chrome and can't be tested in Node.

## Mock browser (`stubBrowserAPI`)

`tests/fixtures/mock-browser.ts` exports `stubBrowserAPI()` — returns all `BrowserAPI` methods as `vi.fn()` with sensible defaults. Uses `satisfies Record<keyof BrowserAPI, ...>` so adding a `BrowserAPI` method without a matching mock is a compile error. Override per-test with `vi.mocked(browser.method).mockResolvedValue(...)`.

## Fake extension (integration tests)

Two modes in `tests/fixtures/fake-extension.ts`:

**Queue-based** — step through commands manually. See `tests/fixtures/browser-helpers.ts:setupBrowser` for the setup pattern: receive a command, assert its type, send a response.

**Callback-based** — automatic responses for e2e. See `tests/fixtures/fake-extension.ts:createRespondingExtension`.

## Task e2e tests (`setupTaskRunTest`)

`tests/fixtures/test-helpers.ts` exports `setupTaskRunTest()` — creates a real WebSocket connection to a fake extension with default command responses. Pass command overrides to customize behavior. See `botc.test.ts` for the canonical e2e test pattern (setup, timing/poll mocking, happy path + error paths, teardown).

## `pollUntil` in tests

`pollUntil` uses `Date.now()` for its deadline — mocking `sleep` alone doesn't eliminate wall-clock delays. E2e task tests must mock both `timing.js` (sleep) and `poll.js` (pollUntil via `fastPollUntil` from `tests/fixtures/poll-mock.ts`). The factory is async-imported inside the `vi.mock` callback because `vi.mock` is hoisted above regular imports. See `botc.test.ts` for the exact pattern.

**`getText()` dispatches a `getContent` command.** `browser.getText()` calls `getContent` internally and unwraps the result. The default test responder in `setupTaskRunTest()` handles `getContent` automatically (returns empty string). If you override `getContent`, your override controls what `getText()` returns. If you accidentally omit `getContent` from a custom responder, `getText()` will hang waiting for a response.

## Port allocation

Use `nextPort()` from `tests/fixtures/port.ts` for parallel-safe ports.

## Database tests (vault)

Use real `node:sqlite` with SAVEPOINT for per-test isolation. See `tests/unit/vault/vault.test.ts` for the `beforeEach`/`afterEach` SAVEPOINT pattern.

## CLI tests (vault-manage)

Tests spawn `node dist/vault/cli/main.js` via `spawnSync`. These run against `dist/` — the global setup in `tests/setup/build-cli.ts` ensures it's built. Always `npm run validate` before testing CLI changes.

Template vault pattern: create vault once in `beforeAll()`, copy per test to avoid repeated scrypt calls.

## Conventions

- Import from `vitest`: `describe`, `it`, `expect`, `beforeAll`, `afterAll`, `beforeEach`, `afterEach`, `vi`
- Use `.js` extensions in imports (ES modules)
- No type assertions — all test code passes strict ESLint
- Error testing: `expect(() => fn()).toThrow()` or `await expect(fn()).rejects.toThrow()`
- Run `npm run validate` after writing tests

## Running

```bash
npx vitest run                          # all tests
npx vitest run tests/unit/vault         # specific directory
npx vitest run --reporter=verbose       # detailed output
```
