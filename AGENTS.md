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

**`chrome.scripting.executeScript` args gotcha**: Chrome cannot serialize `undefined` in the `args` array — it throws `"Value is unserializable"` at runtime. When a Zod schema has optional fields (e.g. `selector: z.string().optional()`), the parsed value is `undefined` when omitted. Always coalesce to a concrete value before passing: `args: [input.selector ?? null, input.html ?? false]`.

### Task Execution: StepRunner

All tasks must use `StepRunner` to register named steps. This enables the debug overlay (pause/rewind/play controls via `Ctrl+Shift+.` in the browser).

```typescript
import { StepRunner } from "../../../framework/step-runner.js";

async function run(browser, context, logger): Promise<TaskResultSuccess> {
  let finalUrl = "";

  const runner = new StepRunner({
    sendStepUpdate: (update) => { browser.sendStepUpdate(update); },
    onControl: (handler) => { browser.onControl(handler); },
    pauseOnError: true,
  });

  runner
    .step("navigate", () => navigate(browser, logger))
    .step("fillLogin", () => fillLogin(browser, logger, email, password))
    .step("submit", () => submit(browser, logger))
    .step("verify", async () => {
      finalUrl = await verify(browser, logger);
    });

  await runner.execute();

  return { ok: true, step: "verify", finalUrl };
}
```

**Rules:**
- Each `.step(name, fn)` is a named logical step (not every browser command — group related commands)
- Steps that return values used later: capture into a closure variable (`let emailSelector = ""`), assign inside the step fn
- Step names should match the existing helper function names
- The runner chains with `.step()` returning `this` — use a single chain, break with `for` loops for dynamic steps
- Always set `pauseOnError: true` — it only activates when `STEP_DEBUG=1` is set in the environment, so it's safe in CI/tests. When active, failed steps pause instead of throwing, letting you inspect via VNC and rewind/retry from the overlay

### Task Design Principle

**Poll for readiness, then act once.** Don't repeatedly click/interact and check if it worked. Instead: poll until the element or condition is present, then perform the action a single time. This keeps steps predictable and logs clean.

```typescript
// Good: poll then click once
while (Date.now() < deadline) {
  const content = await browser.getContent("body");
  if (content.content.includes("Target text")) break;
  await sleep(TIMINGS.afterModalAction);
}
await browser.clickText(["Target text"], { tag: "button", cdp: true });

// Bad: click repeatedly until it works
while (Date.now() < deadline) {
  const result = await browser.clickText(["Target text"], { tag: "button", cdp: true });
  if (result.found) break;
  await sleep(TIMINGS.afterModalAction);
}
```

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

### Shared Task Utilities (`stack/projects/utils/`)

- **`dump.ts`** — Drop-in HTML dumper for debugging. Saves the current page HTML to `/tmp` with a timestamped filename. Usage:
  ```ts
  import { dumpHtml } from "../../utils/dump.js";
  await dumpHtml(browser, logger, "after-login");
  ```
- **`turnstile.ts`** — Cloudflare Turnstile handling.
- **`selectors.ts`** — Shared selector helpers.
- **`timing.ts`** — Timing/delay helpers.

After using any skill, review the conversation history for confusions, mistakes, or non-obvious learnings encountered during implementation. Update the relevant skill's `SKILL.md` with those findings so future uses benefit.

## CI

- **Remote**: GitHub Actions runs on push/PR to `main` via `.github/workflows/ci.yml`.
- **Local**: `npm run ci:local` runs the workflow locally using [`act`](https://github.com/nektos/act). The "Upload coverage" step will fail locally with `Unable to get the ACTIONS_RUNTIME_TOKEN env variable` — this is expected because `act` doesn't provide GitHub's artifact upload API. The actual validation (lint, build, tests, coverage) still runs and its pass/fail is what matters.
- **Quick check**: `npm run validate` runs lint + build + test:coverage directly without Docker, which is faster for local iteration.
