# BrowserTaskRunner

Browser task automation platform.

## Rules

- Prioritise the best end state, not minimal disruption. Don't preserve legacy code. Code churn and migrations are cheap.
- Prioritise developer experience and the DX of callers.
- Avoid in-task retries; the framework owns retry logic.
- Extension and Behaviour are built separately for Chrome compatibility. Some duplication is expected.
- No re-exports, barrel files, or `types.ts` files. Import from the actual source module. Colocate types with their code.
- Prefer descriptive code over JSDoc. Use it only for things the code genuinely can't express.
- Don't use import complexity as an argument against a design.
- **Never edit `TODO.md`.** It is a personal scratchpad maintained only by the user.
- Review `docs/REJECTED.md` for won't-fix decisions and failed approaches. Stack-specific entries are in `docs/rejected/` and load automatically via `.claude/rules/rejected/` when working in the relevant stack. Add to the appropriate sub-file as paths fail.
- This extension is for personal use, not published.
- Trivial improvements that make code more correct (e.g. lowercasing a comment, removing an unused regex flag, naming a magic number) are always appropriate. Don't skip them for being "too small."
- Don't use "personal project" or "only N callers" as a reason to skip a fix. If the improvement is correct, make it.
- Conformity without practicality is too far. Don't enforce patterns purely for uniformity when the non-conforming code works well and is clear.
- Feature branches use `TICKET-KEY/description` format (e.g. `JORG-123/add-login-flow`). The ticket key links the branch to a Jira issue.

## Environment

No dev/prod separation. Runs on a local machine (maybe EC2 later). No environment-based conditionals, separate compose files, or NODE_ENV switches.

## Architecture

Modules with strict separation:

- **Infra**: Docker, Xvfb, Chrome startup. No knowledge of sites or automation logic.
- **Extension**: Generic browser automation bridge. Receives commands, returns results. No site-specific knowledge. Runs in Docker — single tab per container.
- **Framework**: Orchestration, logging, errors, types. Owns retry logic, reports results. No site-specific knowledge.
- **Projects**: All site-specific logic. Each project gets `stack/projects/<name>/`. Projects use spec-driven development via `defineProject()` in a single `project.ts` — the project spec is the primary artifact declaring all tasks, their config, and step sequences. Implementation lives in colocated `.steps.ts` files under `tasks/`. The loader discovers projects from `project.ts` files. See `docs/stack/projects.md`. Shared utilities in `stack/projects/utils/`.
- **Vault**: Local secrets service with project-scoped access control. See `stack/vault/README.md`.
- **Browser**: WebSocket server bridging framework and extension.

Imports flow downward. Projects → framework, browser, utils. Framework → vault. Infra must not import projects. Framework must not import extension. `stack/browser/` bridges framework and extension. Where the same type is needed at the same level, duplicate with sync comments rather than shared imports.

## Review Principles

Quality dimensions that reviews should assess:

- **DX**: Does the overall project and each individual task read well for someone picking it up fresh? Write for onboarding clarity, not insider shorthand.
- **Readability**: Can a reader follow the code and docs without backtracking or guessing intent?
- **Maintainability**: Stale content is worse than missing content. Only write what's needed to convey the point. Remove or update docs that have drifted from reality.
- **Coverage**: Test what matters. Where coverage is intentionally skipped, document why — not just what.
- **Skills**: Repeated dev tasks should be skills. If you do something more than twice, make a skill for it.

## Skills

Use `/task` to create a project, add a task, add a task mode, or add a shared task utility.
Use `/extension` to add or update an extension command, or modify browser instructions.
Use `/vault` to add a vault CLI command, manage secrets, or rotate a project key.
Use `/infra` to add an env var, Docker service, or alert channel.
Use `/test` to add tests for a module.
Use `/review` to review test coverage, DX, or readability.
Use `/debug` to debug a failing task.
Use `/context` to audit context efficiency, check for duplication, or condense documentation.
Use `/jira` to view the Jira ticket for the current branch, pull specs, or enrich a PR with ticket context.
Use `/prs` to split uncommitted changes into multiple logical PRs.
Use `/pr-check` to check CI status of open PRs — surfaces failures with error summaries and fix suggestions.
Use `/prep-review` to prepare changes for PR review — creates branch, splits commits, validates, pushes, and opens a PR.

After using any skill, review the conversation for confusions or non-obvious learnings. Update the relevant skill's `SKILL.md`.

## CI

- **Remote**: GitHub Actions on push/PR to `main` via `.github/workflows/ci.yml`.
- **Local**: `npm run ci:local` (via `act`). "Upload coverage" step fails locally — expected.
- **Quick check**: `npm run validate` (lint + build + test:coverage, no Docker).

## Testing

Tests in `tests/` mirror module structure. Run: `npx vitest run` or `npm run validate`.

| Layer       | Location                     | What it tests                         | Key fixtures              |
| ----------- | ---------------------------- | ------------------------------------- | ------------------------- |
| Unit        | `tests/unit/`                | Pure functions, logging, vault ops    | `stubBrowserAPI()`        |
| Integration | `tests/integration/browser/` | Browser ↔ extension WebSocket         | `createQueuedExtension()` |
| E2E         | `tests/e2e/`                 | Full task `run()` with fake extension | `setupTaskRunTest()`      |

Use `/test` for detailed mocking patterns, fixtures, and conventions.

## Running Tasks

Docker only. No local-dev-without-Docker path. Use VNC (`localhost:5900`) for visual debugging.

## Cross-Cutting Patterns

### `--safemode` flag

Prevents destructive final actions. Threads through CLI (`check.ts`) → Docker Compose → task env var (`SAFE_MODE`). Per-task opt-in for irreversible side effects. See `nandosOrder.steps.ts` for the pattern.

### Vault token env var naming

`VAULT_TOKEN_${project.toUpperCase().replace(/-/g, "_")}`. Task `project`, `.env` token name, and vault CLI commands must be consistent. Project names are freeform.

### Paths

**TypeScript**: `stack/framework/paths.ts` is the single source of truth for runtime-resolved directories (`LOGS_DIR`, `VAULT_DB`, `PROJECTS_DIR`). Import from there — don't compute `resolve(import.meta.dirname, "../../...")` inline. When a new shared directory is needed, add it to `paths.ts`.

**Markdown**: `npm run check:paths` scans all `.md` files for path references (links, backtick paths, "Refer to" directives) and checks they exist on disk. Run it after moving or renaming files. Hypothetical/example paths go in the `ALLOWED_MISSING` set in `scripts/check-paths.ts`.
