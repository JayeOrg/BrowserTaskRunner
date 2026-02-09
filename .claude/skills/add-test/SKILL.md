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

## Mock browser

Import from `tests/unit/projects/utils/testing.ts`:

```typescript
import { createMockBrowser } from "../../../unit/projects/utils/testing.js";

const browser = createMockBrowser();
```

All methods are `vi.fn()` with sensible defaults. Override per test:

```typescript
vi.mocked(browser.waitForSelector).mockResolvedValue({
  type: "waitForSelector",
  found: true,
  selector: ".login-btn",
});
```

When adding a new extension command, add a matching mock to `createMockBrowser()`.

## Fake extension (integration tests)

Two modes in `tests/fixtures/fake-extension.ts`:

**Queue-based** — step through commands manually:

```typescript
import { setupBrowser } from "../../fixtures/browser-helpers.js";

const setup = await setupBrowser();
const cmd = await setup.ext.receiveCommand();
expect(cmd.type).toBe("navigate");
setup.ext.sendResponse({ id: cmd.id, type: "navigate", url: "...", title: "..." });
```

**Callback-based** — automatic responses for e2e:

```typescript
import { createRespondingExtension } from "../../fixtures/fake-extension.js";

const ext = createRespondingExtension(port, (cmd) => {
  if (cmd.type === "click") return { type: "click" };
  return { type: cmd.type };
});
```

## Port allocation

Use `nextPort()` from `tests/fixtures/port.ts` for parallel-safe ports:

```typescript
import { nextPort } from "../../fixtures/port.js";
const port = nextPort();
```

## Database tests (vault)

Use real `node:sqlite` with SAVEPOINT for per-test isolation:

```typescript
beforeEach(() => {
  db.exec("SAVEPOINT test_start");
});

afterEach(() => {
  db.exec("ROLLBACK TO test_start");
  db.exec("RELEASE test_start");
});
```

## CLI tests (vault-manage)

Tests spawn `node dist/vault/cli/main.js` via `spawnSync`. These run against `dist/` — the global setup in `tests/setup/build-cli.ts` ensures it's built. Always `npm run validate` before testing CLI changes.

Template vault pattern: create vault once in `beforeAll()`, copy per test to avoid repeated scrypt calls.

## Fake timers

```typescript
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

logger.log("step", "first");
vi.advanceTimersByTime(1500);
logger.log("step", "second");
```

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
