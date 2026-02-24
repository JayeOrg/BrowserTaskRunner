# Rejected: Testing

Won't-fix decisions for test files and fixtures. Check before proposing changes to test patterns.

- **Error tests separated from happy path in `browser.test.ts`**: The `describe("Error scenarios")` block groups related error tests for quick scanning. Both collocated and separated approaches are valid.
- **`createDeps` factory name in `step-runner.test.ts`**: The function creates deps, not a runner. Callers construct the runner themselves. The name is accurate.
- **`setupRawTaskTest` vs `setupTaskRunTest` naming in `test-helpers.ts`**: The names reflect different abstraction levels. `Raw` signals "bring your own responder."
- **`state` mutability signal in `createDefaultResponder` in `test-helpers.ts`**: `state` as a mutable container is a standard pattern. The destructuring `{ responder, state }` makes the return clear.
- **`changePassword` test isolation via `beforeEach` rollback in `vault.test.ts`**: The test isolation is correct. The `beforeAll`/`beforeEach` pattern is visible at the top of the file.
- **Key comment placement in `loader.test.ts`**: The comment is between imports and `beforeEach` — a natural reading position. Moving to top-of-file separates it from the code it explains.
- **"Attach rejection handler" comment not replicated in `browser.test.ts`**: Other tests using the same pattern don't need the comment — the pattern is established by this first instance.
- **Module-level `attemptCount` in `retry-task.ts`**: `resetAttempts()` is called in `beforeEach`. The reset function's existence documents the need.
- **Fake timers scoped globally in `dump.test.ts`**: All three tests write timestamped filenames. Fake timers ensure deterministic filenames across all tests.
- **`neverResolves` in shared `test-helpers.ts` used by one test**: One import from a shared fixtures file. Moving adds a file for one export. Available for future tests that need it.
