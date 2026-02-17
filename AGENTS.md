The issue I'm trying to solve:

- Login is down for the target URL
- I want an autonomous task that will check logging into the target every five minutes

The steps are:

- Navigate to the site
- Enter login details
- Pass the cloudflare human check
- Attempt to log in
- IF navigation is successful, end and alert
- ELSE re-attempt logging in each five minutes until navigation is successful or the task errors

Notes:

- Don't care about code churn cost when coming up with new solutions
- Don't factor in the cost of a DB migration when suggesting changes — migrations are cheap and welcome
- Prioritise the best end state, not minimal disruption
- Prioritise developer experience
- Don't preserve legacy code
- Avoid adding in-task retries; the framework owns retry logic.
- Prioritise the DX of callers.
- Extension and Behaviour have to be built separately so extension is chrome compatible. There will be some duplication across them.
- Don't add re-exports or barrel files to simplify imports. IDEs handle import paths. Import from the actual source module.
- Don't create `types.ts` files. Colocate types with the code that uses them and export from there.
- **Never edit `TODO.md`.** It is a personal scratchpad maintained only by the user.
- Don't use import complexity as an argument against a design. Long import paths are fine — IDEs autocomplete them and they have zero runtime cost.

Review `REJECTED.md` for won't-fix decisions and failed approaches. Add to it as paths fail or DX review items are confirmed as won't-fix.

We don't want to publish this extension, it's for personal use.

## Environment

There is no dev/prod separation. This runs on a local machine (and maybe an EC2 later). Don't introduce environment-based conditionals, separate compose files, or NODE_ENV switches.

## Architecture

Modules with strict separation:

- **Infra**: Docker, Xvfb, Chrome startup. No knowledge of sites or automation logic.
- **Extension**: Generic browser automation bridge. Receives commands, returns results. No site-specific knowledge.
  - Runs in Docker — single tab per container. `tabs.ts` queries the active tab on each command.
- **Framework**: Orchestration, logging, errors, types. Owns retry logic, reports results. No site-specific knowledge.
- **Projects**: All site-specific logic lives here. Each project gets its own subdirectory under `stack/projects/`. Shared task utilities live in `stack/projects/utils/`.
- **Vault**: Local secrets service with project-scoped access control. See `stack/vault/README.md`.
  - Note: `node:sqlite` enables `PRAGMA foreign_keys = ON` by default (unlike the C library). Don't add it manually — it's already on.
  - **Defense-in-depth.** Vault code includes type checks and guards that are technically unreachable (SQLite STRICT mode, CLI flow ordering). These are intentional redundancy for direct callers bypassing the CLI.
- **Browser**: WebSocket server bridging framework and extension.

### Extension Design Principle

Keep extension commands **minimal and generic** while maintaining **developer experience**:

- Extension should only know _how_ to interact with the DOM (click, fill, wait, query)
- Tasks should own _what_ to interact with (selectors, coordinates, timing)
- Prefer typed primitives (`click(selector)`) over stringly-typed code (`executeScript("document.querySelector...")`)
- When adding new capabilities, ask: "Is this generic enough that any site might need it?"

Good extension commands: `click`, `fill`, `waitForSelector`, `navigate`, `cdpClick`, `querySelectorRect`, `select`, `keyboard`, `check`, `scroll`, `getFrameId`
Bad extension commands: `clickTurnstile`, `fillLoginForm`, `detectCaptcha`

**`script-results.ts` uses Zod `safeParse()` intentionally.** Don't replace with manual `typeof` guards. The schemas are the single source of truth for both types (`z.infer`) and runtime validation — manual guards would drift. `ScriptFoundSchema` has nested optionals that make manual checks verbose and error-prone. These run once per command (not a hot loop), so allocation cost is irrelevant. And `executeScript` results run in the page's JS context, so they're not fully "trusted internal data."

**`chrome.scripting.executeScript` args gotcha**: Chrome cannot serialize `undefined` in the `args` array — it throws `"Value is unserializable"` at runtime. When a Zod schema has optional fields (e.g. `selector: z.string().optional()`), the parsed value is `undefined` when omitted. Always coalesce to a concrete value before passing: `args: [input.selector ?? null, input.html ?? false]`.

**Command handler exhaustiveness.** `commandHandlers` in `messages/index.ts` uses `satisfies Record<CommandMessage["type"], CommandHandler>` so adding a new command type without a handler is a compile error. `IncomingCommand` stays loose as a wire format; zod schemas validate at runtime.

**`isResponseMessage` is intentionally loose.** It checks structure (`{type: string}`), not known type values. The narrowing is technically unsound but harmless — `handleResponse` drops unrecognized IDs. Validating against known types would duplicate the `ResponseMessage` union.

**Zero-size rect defense.** `cdpClickSelector` returns `found: false` for elements with zero-width/height bounding rects. Hidden/detached elements (e.g. modals still in DOM) report zero-size rects — clicking their center would land at (0,0), hitting the wrong target.

**iframe support.** Commands that use `executeScript` accept an optional `frameId` parameter for targeting iframes. Use `browser.getFrameId("iframe.selector")` to resolve an iframe element to its frameId, then pass it to other commands: `browser.click("#btn", { frameId })`. The `getScriptTarget(frameId?)` helper in `script-target.ts` builds the correct `executeScript` target object. Commands not supporting frameId: `cdpClick` (viewport-level), `clickText`/`querySelectorRect` (coordinate-based), `navigate`/`getUrl` (tab-level).

**Keyboard input uses CDP.** The `keyboard` command uses `chrome.debugger` for `Input.insertText` (type action) and `Input.dispatchKeyEvent` (press/down/up actions). Unlike `cdpClick`, keyboard has no DOM fallback — if debugger attach fails, it returns an error. The `type` method focuses the element first via `executeScript`, then uses CDP `Input.insertText` for efficient single-call text insertion.

### Task Execution: StepRunner

All tasks must use `StepRunner` to register named steps. This enables the debug overlay (pause/rewind/play controls via `Ctrl+Shift+.` in the browser).

```typescript
import { StepRunner, type StepRunnerDeps } from "../../../framework/step-runner.js";

async function run(browser, context, deps: StepRunnerDeps): Promise<TaskResultSuccess> {
  let finalUrl = "";

  const runner = new StepRunner(deps);

  runner
    .step("navigate", (log) => navigate(browser, log))
    .step("fillLogin", (log) => fillLogin(browser, log, email, password))
    .step("submit", (log) => submit(browser, log))
    .step("verify", async (log) => {
      finalUrl = await verify(browser, log);
    });

  await runner.execute();

  return { ok: true, step: "verify", finalUrl };
}
```

**Rules:**

- Each `.step(name, fn)` is a named logical step (not every browser command — group related commands)
- Steps that return values used later: capture into a closure variable (`let finalUrl = ""`), assign inside the step fn. **Minimise these** — if step B always needs step A's output, merge them into one step. Only use closure variables for values that genuinely span independent steps (e.g. `finalUrl` used in the return value)
- Steps are `(log: StepLogger) => Promise<void>` — each step receives its own scoped logger. Inter-step data flows through closure variables. Pipeline/context-bag approaches were rejected because rewind/skipBack replays steps out of order, conditional steps may not run, and dynamic step addition breaks pipeline assumptions
- Step names should match the existing helper function names. Use `:` as a subtitle separator to differentiate multiple calls of the same step type (e.g. `addItem:PERi-Chip Wrap`)
- The runner chains with `.step()` returning `this` — use a single chain, break with `for` loops for dynamic steps
- `pauseOnError` defaults to `true` — failed steps pause instead of throwing, letting you inspect via VNC and rewind/retry from the overlay. Tests pass `pauseOnError: false` via `BrowserOptions` so errors throw immediately for assertions

### Task Design Principle

**Poll for readiness, then act once.** Don't repeatedly click/interact and check if it worked. Instead: poll until the element or condition is present, then perform the action a single time. This keeps steps predictable and logs clean.

The Browser API has built-in polling for common patterns — prefer these over manual loops:

```typescript
// Good: use built-in polling
await browser.waitForText(["Target text"], 15_000);
await browser.clickText(["Target text"], { tag: "button", cdp: true, timeout: 15_000 });
await browser.waitForUrl("/checkout", 30_000);

// Good: pollUntil for custom conditions
import { pollUntil } from "../../utils/poll.js";
const result = await pollUntil(
  () => browser.getUrl(),
  ({ url }) => !url.includes("/sign-in"),
  { timeoutMs: 30_000, intervalMs: 5_000 },
);

// Bad: manual polling loop for something the API already covers
while (Date.now() < deadline) {
  const content = await browser.getText();
  if (content.includes("Target text")) break;
  await sleep(500);
}
```

**Sleep vs poll.** Use `sleep` for intentional pacing delays between actions (animation settling, rate limiting). Use `pollUntil` or built-in `waitFor*` methods for conditions that depend on external state changes (URL redirects, element appearance). If you're sleeping then checking a condition once, you almost certainly want polling instead.

**DOM click vs CDP click on Cloudflare-protected sites.** Cloudflare detects CDP-dispatched input events on form submission and rejects them. On Cloudflare-protected pages, use DOM clicks (`clickFirst`, `browser.click`) for form submission buttons. CDP clicks (`cdpClickSelector`, `cdpClick`) are fine for non-form interactions like menu navigation.

**`fill` vs `type` for form inputs.** `fill(selector, value)` sets `.value` directly and dispatches `input`/`change` events — fast but bypasses per-character event handlers. `type(selector, text)` uses CDP `Input.insertText` to simulate real keyboard input, which fires native key events that React/Angular controlled inputs respond to. Use `fill` for simple forms; use `type` when the site has keystroke-based validation or formatting.

**Dropdown and checkbox interactions.** Use `selectOption(selector, values)` for `<select>` elements — it handles both single and `<select multiple>`. Use `check(selector)` / `uncheck(selector)` for checkboxes and radios — they dispatch a full click event chain (mousedown/mouseup/click) when the state needs to change, which properly triggers form validation and framework bindings.

**Scrolling.** `scrollIntoView(selector)` scrolls an element to the viewport center — prefer this when you need to interact with an off-screen element. `scrollTo(x, y)` and `scrollBy(x, y)` are for absolute/relative page scrolling (e.g. infinite scroll pages).

Use `/add-extension-command` to add a new extension command.
Use `/update-browser-api` to modify an existing extension command.
Use `/add-task` to add a new task.
Use `/add-task-mode` to add a new task execution mode.
Use `/add-test` to add tests for a module.
Use `/add-vault-command` to add a new vault CLI command.
Use `/add-vault-detail` to add or manage project secrets.
Use `/rotate-vault-key` to rotate a project's vault key.
Use `/add-env-var` to thread a new env var through Docker.
Use `/add-docker-service` to add a new Docker service.
Use `/add-alert-channel` to add a new alert channel.
Use `/add-browser-instruction` to modify browser setup instructions.
Use `/create-project` for end-to-end project setup.
Use `/add-task-util` to add a shared task utility.
Use `/debug-task` to debug a failing task.
Use `/review-dx` to review DX and readability across the codebase.
Use `/review-tests` to review test coverage, comprehensiveness, and readability.

### Shared Task Utilities (`stack/projects/utils/`)

- **`dump.ts`** — Drop-in HTML dumper for debugging. Saves the current page HTML to `/tmp` with a timestamped filename. Usage:
  ```ts
  import { dumpHtml } from "../../utils/dump.js";
  await dumpHtml(browser, logger, "after-login");
  ```
- **`turnstile.ts`** — Cloudflare Turnstile handling.
- **`selectors.ts`** — Shared selector helpers (`waitForFirst`, `clickFirst`, `fillFirst`).
- **`timing.ts`** — Timing/delay helpers (`sleep`).
- **`poll.ts`** — Generic polling (`pollUntil`) for custom conditions not covered by Browser's built-in `waitForText`/`waitForUrl`.
- **`schemas.ts`** — Shared Zod schemas (`loginContextSchema`) for tasks with common context shapes.

After using any skill, review the conversation history for confusions, mistakes, or non-obvious learnings encountered during implementation. Update the relevant skill's `SKILL.md` with those findings so future uses benefit.

## CI

- **Remote**: GitHub Actions runs on push/PR to `main` via `.github/workflows/ci.yml`.
- **Local**: `npm run ci:local` runs the workflow locally using [`act`](https://github.com/nektos/act). The "Upload coverage" step will fail locally with `Unable to get the ACTIONS_RUNTIME_TOKEN env variable` — this is expected because `act` doesn't provide GitHub's artifact upload API. The actual validation (lint, build, tests, coverage) still runs and its pass/fail is what matters.
- **Quick check**: `npm run validate` runs lint + build + test:coverage directly without Docker, which is faster for local iteration.

# SiteCheck Project Memory

## Architecture

- **Primary modules**: Framework, Tasks, Browser — the 3 concepts task authors touch
- **Implementation details**: Extension (Chrome-side handlers), Infra (Docker/Xvfb)
- Framework owns orchestration (retry loops, logging, errors, types). Tasks own site-specific logic (single attempt).
- Extension ↔ Browser communicate via WebSocket with typed JSON messages
- Task discovery is convention-based: filename = task name, `export const task` in `stack/projects/*/tasks/{taskName}.ts`, loaded by `stack/framework/loader.ts`

## Key Patterns

- `node:sqlite` enables `PRAGMA foreign_keys = ON` by default (unlike C SQLite)
- scrypt `maxmem` defaults to 32MB; cost=131072 needs `maxmem: 256 * 1024 * 1024` explicitly
- `TaskConfig = SingleAttemptTask | RetryingTask` — discriminated union on `mode: "once" | "retry"`
- Tasks declare `contextSchema?: ZodMiniType` for optional Zod validation before `run()`
- Zod is `zod/v4/mini` — `ZodMiniType` has `.safeParse()` method, consistent with `script-results.ts`
- **Double context parsing is intentional.** Framework calls `safeParse()` as a gate (fail early with a clear error before connecting to browser). Tasks call `contextSchema.parse()` again to get a typed destructured object. Making `run` generic on schema output was rejected: the generic erases at `TaskConfig[]` since TS lacks existentials, and the only payoff would be saving one `.parse()` line per task. Tasks own their own context typing — framework stays type-agnostic about context shape.
- Framework uses `node:timers/promises` setTimeout for retry delays (avoids importing from tasks layer)
- Class is `Browser` (in `stack/browser/browser.ts`), tasks receive `browser: BrowserAPI` parameter

## Build Pipeline

- `npm run validate` runs lint + build + tests (build includes typecheck via `tsc`)
- CLI tests (`vault-manage.test.ts`) run against `dist/` — validate builds first to avoid stale code
- Prettier enforces formatting — always run `npm run validate` after changes

## ESLint Gotchas

- No `_underscore` prefixed vars (`no-underscore-dangle`)
- No type assertions (`@typescript-eslint/consistent-type-assertions`)
- No non-null assertions (`@typescript-eslint/no-non-null-assertion`)
- `default-case` required in switch statements
- Prettier enforces formatting — always run `npm run validate` after changes

## DX Preferences

- Don't propose dev scripts (dev:watch improvements, vault:dev, etc.) — not needed
- Don't flag deep relative imports as a DX issue — IDEs resolve, autocomplete, and navigate them. Path aliases add build complexity for zero readability gain.
- Never dismiss a DX improvement because code is "internal" or because of "churn cost." All code deserves good DX — being internal doesn't make clarity less important, and churn is cheap.

## Conventions (from AGENTS.md)

- Don't create `types.ts` files — colocate types with code
- Don't add re-exports or barrel files
- Import from actual source module
- These are tasks, not tests — don't confuse terminology

