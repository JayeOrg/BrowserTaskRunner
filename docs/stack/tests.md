### Test Conventions

Tests in `tests/` mirror module structure. Use `/test` for detailed mocking patterns and fixtures.

**Key patterns:**
- `stubBrowserAPI()` — mock all BrowserAPI methods as `vi.fn()` (unit tests)
- `setupTaskRunTest()` — real WebSocket + fake extension with default responders (e2e)
- `fastPollUntil` — mock both `timing.js` (sleep) and `poll.js` (pollUntil) in e2e tests
- `nextPort()` — parallel-safe port allocation
- `pauseOnError: false` — so errors throw immediately in tests

**When testing tasks**, understand the task design rules in docs/stack/projects.md (poll-then-act, deterministic clicks, Cloudflare DOM clicks).
