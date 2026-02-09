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
- Prioritise the best end state, not minimal disruption
- Prioritise developer experience
- Don't preserve legacy code
- Avoid adding in-task retries; the framework owns retry logic.
- Prioritise the DX of callers.
- Extension and Behaviour have to be built separately so extension is chrome compatible. There will be some duplication across them.
- Don't add re-exports or barrel files to simplify imports. IDEs handle import paths. Import from the actual source module.
- Don't create `types.ts` files. Colocate types with the code that uses them and export from there.
- Don't use import complexity as an argument against a design. Long import paths are fine — IDEs autocomplete them and they have zero runtime cost.

Review FAILED_APPROACHES for things to avoid, and add to it as paths fail.

We don't want to publish this extension, it's for personal use.

## Architecture

Modules with strict separation:

- **Infra**: Docker, Xvfb, Chrome startup. No knowledge of sites or automation logic.
- **Extension**: Generic browser automation bridge. Receives commands, returns results. No site-specific knowledge.
- **Framework**: Orchestration, logging, errors, types. Owns retry logic, reports results. No site-specific knowledge.
- **Projects**: All site-specific logic lives here. Each project gets its own subdirectory under `stack/projects/`. Shared task utilities live in `stack/projects/utils/`.
- **Vault**: Local secrets service with project-scoped access control. See `stack/vault/README.md`.
  - Note: `node:sqlite` enables `PRAGMA foreign_keys = ON` by default (unlike the C library). Don't add it manually — it's already on.
- **Browser**: WebSocket server bridging framework and extension.

### Extension Design Principle

Keep extension commands **minimal and generic** while maintaining **developer experience**:

- Extension should only know _how_ to interact with the DOM (click, fill, wait, query)
- Tasks should own _what_ to interact with (selectors, coordinates, timing)
- Prefer typed primitives (`click(selector)`) over stringly-typed code (`executeScript("document.querySelector...")`)
- When adding new capabilities, ask: "Is this generic enough that any site might need it?"

Good extension commands: `click`, `fill`, `waitForSelector`, `navigate`, `cdpClick`, `querySelectorRect`
Bad extension commands: `clickTurnstile`, `fillLoginForm`, `detectCaptcha`

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

## CI

- **Remote**: GitHub Actions runs on push/PR to `main` via `.github/workflows/ci.yml`.
- **Local**: `npm run ci:local` runs the workflow locally using [`act`](https://github.com/nektos/act). The "Upload coverage" step will fail locally with `Unable to get the ACTIONS_RUNTIME_TOKEN env variable` — this is expected because `act` doesn't provide GitHub's artifact upload API. The actual validation (lint, build, tests, coverage) still runs and its pass/fail is what matters.
- **Quick check**: `npm run validate` runs lint + build + test:coverage directly without Docker, which is faster for local iteration.
