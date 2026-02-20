Autonomous browser automation that checks site logins (e.g. every 5 minutes): navigate → enter credentials → pass Cloudflare → verify login → alert on success or retry.

## Rules

- Prioritise the best end state, not minimal disruption. Don't preserve legacy code. Code churn and migrations are cheap.
- Prioritise developer experience and the DX of callers.
- Avoid in-task retries; the framework owns retry logic.
- Extension and Behaviour are built separately for Chrome compatibility. Some duplication is expected.
- No re-exports, barrel files, or `types.ts` files. Import from the actual source module. Colocate types with their code.
- Prefer descriptive code over JSDoc. Use it only for things the code genuinely can't express.
- Don't use import complexity as an argument against a design.
- **Never edit `TODO.md`.** It is a personal scratchpad maintained only by the user.
- Review `REJECTED.md` for won't-fix decisions and failed approaches. Add to it as paths fail.
- This extension is for personal use, not published.

## Environment

No dev/prod separation. Runs on a local machine (maybe EC2 later). No environment-based conditionals, separate compose files, or NODE_ENV switches.

## Architecture

Modules with strict separation:

- **Infra**: Docker, Xvfb, Chrome startup. No knowledge of sites or automation logic.
- **Extension**: Generic browser automation bridge. Receives commands, returns results. No site-specific knowledge. Runs in Docker — single tab per container.
- **Framework**: Orchestration, logging, errors, types. Owns retry logic, reports results. No site-specific knowledge.
- **Projects**: All site-specific logic. Each project gets `stack/projects/<name>/`. Shared utilities in `stack/projects/utils/`.
- **Vault**: Local secrets service with project-scoped access control. See `stack/vault/README.md`.
  - `node:sqlite` enables `PRAGMA foreign_keys = ON` by default. Don't add it manually. FK constraints are always active — code that works around them (INSERT+DELETE pattern) is correct and necessary.
  - **Defense-in-depth.** Vault code includes technically unreachable guards. Intentional redundancy for direct callers bypassing the CLI.
- **Browser**: WebSocket server bridging framework and extension.

Imports flow downward. Projects → framework, browser, utils. Framework → vault. Infra must not import projects. Framework must not import extension. `stack/browser/` bridges framework and extension. Where the same type is needed at the same level, duplicate with sync comments rather than shared imports.

### Extension Design Principle

Keep commands **minimal and generic**: extension knows _how_ to interact with DOM; tasks own _what_ to interact with. Prefer typed primitives over `executeScript`. Ask: "Is this generic enough that any site might need it?"

Good: `click`, `fill`, `waitForSelector`, `navigate`, `cdpClick`, `querySelectorRect`, `select`, `keyboard`, `check`, `scroll`, `getFrameId`
Bad: `detectAndClickTurnstile`, `fillLoginForm`, `detectCaptcha`

See `stack/browser/README.md` for implementation details. Use `/extension` for adding/updating commands.

### Task Design

All tasks use `StepRunner` for named steps (enables debug overlay via `Ctrl+Shift+.`). See `botcLogin.ts` for the canonical pattern. `run()` returns `runner.execute()` directly — the framework captures the browser URL automatically. Use `/task` for detailed guidance.

**Core rules:**
- **Poll for readiness, then act once.** Don't repeatedly click and check. Poll until ready, act once.
- **All clicks must be deterministic.** Never put clicks inside `pollUntil`. Poll callbacks are read-only.
- Prefer `waitForText`, `waitForUrl`, `clickText` over manual loops. Use `pollUntil` for custom conditions. Never use `while (Date.now() < deadline)`.
- Use `sleep` for pacing delays. Use `pollUntil`/`waitFor*` for conditions. If you're sleeping then checking once, you want polling.
- **DOM clicks for form submission on Cloudflare-protected sites.** Cloudflare detects CDP input events. Use DOM clicks (`clickFirst`, `browser.click`) for form buttons. CDP clicks are fine elsewhere.
- **`fill` vs `type`**: `fill` sets `.value` directly (fast, simple forms). `type` uses CDP `Input.insertText` (keystroke-based validation, React controlled inputs).

### Shared Task Utilities (`stack/projects/utils/`)

`dump.ts` (HTML dumper), `turnstile.ts` (Cloudflare), `selectors.ts` (`waitForFirst`/`clickFirst`/`fillFirst`), `timing.ts` (`sleep`), `poll.ts` (`pollUntil`), `schemas.ts` (`loginSecretsSchema`).

## Skills

Use `/task` to create a project, add a task, add a task mode, or add a shared task utility.
Use `/extension` to add or update an extension command, or modify browser instructions.
Use `/vault` to add a vault CLI command, manage secrets, or rotate a project key.
Use `/infra` to add an env var, Docker service, or alert channel.
Use `/test` to add tests for a module.
Use `/review` to review test coverage, DX, or readability.
Use `/debug` to debug a failing task.

After using any skill, review the conversation for confusions or non-obvious learnings. Update the relevant skill's `SKILL.md`.

## CI

- **Remote**: GitHub Actions on push/PR to `main` via `.github/workflows/ci.yml`.
- **Local**: `npm run ci:local` (via `act`). "Upload coverage" step fails locally — expected.
- **Quick check**: `npm run validate` (lint + build + test:coverage, no Docker).

## Testing

Tests in `tests/` mirror module structure. Run: `npx vitest run` or `npm run validate`.

| Layer | Location | What it tests | Key fixtures |
|-------|----------|---------------|--------------|
| Unit | `tests/unit/` | Pure functions, logging, vault ops | `stubBrowserAPI()` |
| Integration | `tests/integration/browser/` | Browser ↔ extension WebSocket | `createQueuedExtension()` |
| E2E | `tests/e2e/` | Full task `run()` with fake extension | `setupTaskRunTest()` |

Use `/test` for detailed mocking patterns, fixtures, and conventions.

## Running Tasks

Docker only. No local-dev-without-Docker path. Use VNC (`localhost:5900`) for visual debugging.

## Cross-Cutting Patterns

### `--safemode` flag

Prevents destructive final actions. Threads through CLI (`check.ts`) → Docker Compose → task env var (`SAFE_MODE`). Per-task opt-in for irreversible side effects. See `nandosOrder.ts` for the pattern.

### Vault token env var naming

`VAULT_TOKEN_${project.toUpperCase().replace(/-/g, "_")}`. Task `project`, `.env` token name, and vault CLI commands must be consistent. Project names are freeform.

## Reviewer Checklist

- [ ] `TASK` constant with `name` matching filename and `displayUrl`
- [ ] `project` matches vault project name in `.env` and README
- [ ] `needs: needsFromSchema(schema)` — derive from Zod schema, not manual array
- [ ] `secretsSchema` set to the same Zod schema
- [ ] Step functions use `log: StepLogger` as first parameter, registered via `runner.step(fn, ...args)`
- [ ] Named steps use `runner.named(subtitle, fn, ...args)` for reused functions (e.g. `addMenuItem`)
- [ ] `run()` returns `runner.execute()` directly
- [ ] Magic strings extracted to named constants
- [ ] `fillFirst`/`clickFirst`/`pollUntil` from `utils/` instead of manual loops
- [ ] DOM clicks for form submission on Cloudflare-protected sites
- [ ] `SAFE_MODE` check if task has irreversible side effects
- [ ] No unnecessary closure variables between steps
- [ ] E2e tests use `setupTaskRunTest()` with command overrides
- [ ] E2e tests mock both `timing.js` and `poll.js`
- [ ] Tests cover happy path and key failure paths
- [ ] Tests use `pauseOnError: false` so errors throw immediately
