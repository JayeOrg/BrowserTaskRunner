### Spec-Driven Development

Projects follow a spec-as-source pattern via `defineProject()` from `stack/framework/project.ts`. One `project.ts` per project is the single source of truth — a reader scans 10-20 lines to know every task in the project, what secrets each needs, and what steps each runs. Implementation details (selectors, timings, step handlers, orchestration) live in colocated `.steps.ts` files. Specs are pure data — no code, only imports and declarations.

Each project is one spec plus steps files:

```text
stack/projects/<name>/
  project.ts               defineProject() call (the source of truth)
  tasks/
    <taskName>.steps.ts    handlers: constants + step implementations
```

`defineProject` injects the project name into each task, auto-derives `needs` from `secretsSchema`, and generates the `run` function from the `steps` array. For complex tasks needing conditional steps or shared state, the steps file exports a `run` function that the spec references.

Import direction (no cycles): project.ts -> steps files -> shared utils.

See `stack/projects/botc/project.ts` for the canonical linear task (steps array). See `stack/projects/nandos/project.ts` for the canonical complex task (custom run imported from steps).

### Task Design

All tasks use `StepRunner` for named steps (enables debug overlay via `Ctrl+Shift+.`). `run()` returns `runner.execute()` directly — the framework captures the browser URL automatically. Use `/task` for detailed guidance.

**Core rules:**
- **Poll for readiness, then act once.** Don't repeatedly click and check. Poll until ready, act once.
- **All clicks must be deterministic.** Never put clicks inside `pollUntil`. Poll callbacks are read-only.
- Prefer `waitForText`, `waitForUrl`, `clickText` over manual loops. Use `pollUntil` for custom conditions. Never use `while (Date.now() < deadline)`.
- Use `sleep` for pacing delays. Use `pollUntil`/`waitFor*` for conditions. If you're sleeping then checking once, you want polling.
- **DOM clicks for form submission on Cloudflare-protected sites.** Cloudflare detects CDP input events. Use DOM clicks (`clickFirst`, `browser.click`) for form buttons. CDP clicks are fine elsewhere.
- **`fill` vs `type`**: `fill` sets `.value` directly (fast, simple forms). `type` uses CDP `Input.insertText` (keystroke-based validation, React-controlled inputs).

### Shared Task Utilities (`stack/projects/utils/`)

`dump.ts` (HTML dumper), `turnstile.ts` (Cloudflare), `selectors.ts` (`waitForFirst`/`clickFirst`/`fillFirst`), `timing.ts` (`sleep`), `poll.ts` (`pollUntil`), `schemas.ts` (`loginSecretsSchema`).
