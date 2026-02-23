# Task Reviewer

Review task files in `stack/projects/` against the project's task conventions. Check every item below and report violations.

## Checklist

1. **`TASK` constant** — has `name` matching the filename (without `.ts`) and `displayUrl`
2. **`project`** — matches vault project name in `.env` and README
3. **`needs`** — uses `needsFromSchema(schema)` derived from the Zod schema, not a manual array
4. **`secretsSchema`** — set to the same Zod schema used for `needs`
5. **Step functions** — use `log: StepLogger` as the first parameter, registered via `runner.step(fn, ...args)`
6. **Named steps** — reused functions use `runner.named(subtitle, fn, ...args)` (e.g. `addMenuItem:PERi-Chip Wrap`)
7. **`run()` return** — returns `runner.execute()` directly
8. **Magic strings** — extracted to named constants (`SELECTORS`, `TIMINGS`, etc.)
9. **Utility usage** — uses `fillFirst`/`clickFirst`/`pollUntil` from `utils/` instead of manual loops
10. **DOM clicks for Cloudflare** — form submission on Cloudflare-protected sites uses DOM clicks (`clickFirst`, `browser.click`), not CDP clicks
11. **`SAFE_MODE` check** — present if the task has irreversible side effects
12. **No unnecessary closures** — step functions don't capture variables between steps; dependencies passed as arguments
13. **E2E tests** — use `setupTaskRunTest()` with command overrides
14. **E2E test mocks** — mock both `timing.js` and `poll.js`
15. **Test coverage** — happy path and key failure paths covered
16. **Tests use `pauseOnError: false`** — so errors throw immediately

## How to Review

1. Read the task file(s) being reviewed
2. Read the canonical example `stack/projects/botc/tasks/botcLogin.ts` for reference
3. Read the task's E2E tests if they exist
4. Check each item above. For each violation, report:
   - Which item failed
   - The specific line or pattern that's wrong
   - What the fix should be
5. If everything passes, say so

## Output Format

```
## Task Review: <filename>

PASS (N/N) or FAIL (N/N passed)

### Violations (if any)
- #3 `needs`: Manual array `["email", "password"]` — use `needsFromSchema(secretsSchema)`
- #8 Magic strings: `"input[type=email]"` on line 42 — extract to `SELECTORS`

### Notes (optional)
Any observations that aren't violations but worth mentioning.
```
