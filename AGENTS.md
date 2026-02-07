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
- **Browser**: WebSocket server bridging framework and extension.

### Extension Design Principle

Keep extension commands **minimal and generic** while maintaining **developer experience**:

- Extension should only know _how_ to interact with the DOM (click, fill, wait, query)
- Tasks should own _what_ to interact with (selectors, coordinates, timing)
- Prefer typed primitives (`click(selector)`) over stringly-typed code (`executeScript("document.querySelector...")`)
- When adding new capabilities, ask: "Is this generic enough that any site might need it?"

Good extension commands: `click`, `fill`, `waitForSelector`, `navigate`, `cdpClick`, `querySelectorRect`
Bad extension commands: `clickTurnstile`, `fillLoginForm`, `detectCaptcha`

See `agents/extension/adding-commands.md` for how to add a new extension command.
See `agents/tasks/adding-tasks.md` for how to add a new task.
