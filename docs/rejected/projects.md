# Rejected: Projects

Won't-fix decisions for `stack/projects/` — task files and shared utilities. Check before proposing changes to tasks or utils.

- **Project scaffolding template (`stack/projects/_template/`)**: A skeleton README and task file for new projects was considered. New projects are created by copying an existing task file (`botcLogin.ts` is the canonical reference) and an existing project README. At 2 projects, copying is simpler than maintaining a template that drifts from the real code. The README's "Adding New Tasks" section has an inline code template, and the reviewer checklist covers the required structure.
- **Magic numbers in `TIMINGS` constants**: Values like `3000`, `5000`, `10000` in task timing constants are empirical — they were tuned against the real sites. Naming them more descriptively (e.g., `SLOW_PAGE_LOAD`) wouldn't add clarity since the appropriate delay depends on the site's behavior, not on a category.
- **`clickSignIn` in nandosOrder.ts uses CDP click on submit button**: Nandos sign-in page is not behind a Cloudflare challenge — the Turnstile handling only appears on certain pages. CDP click works here and is intentional.
- **All project schemas in one file (`schemas.ts`)**: Only 2 schemas today. Splitting into per-project files is premature until there's actual conflict.
- **`SAFE_MODE` env var in `nandosOrder.ts`**: Safety valve for dev/testing — prevents accidentally placing a real food order. Task-level feature flag, not infrastructure. Not the same as dev/prod environment separation. Threaded via `--safemode` CLI flag -> `SAFE_MODE` env var -> Docker compose -> task.
- **`TIMINGS` has 14 keys; single-use ones could be local in `nandosOrder.ts`**: All timing values at the top in one place makes them easy to find and tune together. Scattering into functions would require searching. Correct approach for empirical constants.
- **`verifyLogin` after `handleMfa` in `nandosOrder.ts`**: Defensive redundancy — costs one `getUrl()` call and catches edge cases if `handleMfa`'s poll has a subtle bug. Intentional safety.
- **`log.success("No turnstile found")` in `botcLogin.ts:69`**: `success` makes the log output easy to scan. "No obstacle found" is a positive outcome from the step's perspective.
- **`SAFE_MODE` case-sensitive check in `nandosOrder.ts:49`**: The env var is set programmatically by `check.ts` (always `"true"`) and never typed by hand. Case sensitivity is fine for machine-set values.
- **`waitForFirst` error array index coupling in `selectors.ts`**: `Promise.any` preserves insertion order for `errors` — well-defined JS behavior. The coupling is correct.
- **`fillFirst` has no JSDoc in `selectors.ts`**: One-line function that delegates to `waitForFirst` + `browser.fill`. Self-explanatory from the code.
- **`TURNSTILE_SELECTORS` has no extensibility comment in `turnstile.ts`**: Self-explanatory CSS selectors. A new project author would naturally extend the array.
- **`pollUntil` zero `timeoutMs` edge case in `projects/utils/poll.ts`**: The `intervalMs > 0` guard prevents busy-loops. Zero `timeoutMs` is a caller error, not a poll edge case.
- **`pollUntil` `@throws` not documented in JSDoc in `projects/utils/poll.ts`**: The throw is the first line of the function with a clear message. JSDoc `@throws` for a one-line validation guard is over-documenting.
- **`sleep` re-export hides `setTimeout` overloads in `timing.ts`**: Tasks only need `sleep(ms)`. The alias correctly narrows the interface.
- **`LOGS_DIR` three-level `../` in `dump.ts`**: Standard resolution pattern, same as `run.ts`. Stable path.
- **Closure capture pattern undocumented in task files**: Both tasks demonstrate it identically. New tasks are created by copying existing ones. (Most closure variables eliminated — `FINAL_STEP` and `finalUrl` removed; framework captures URL automatically.)
- **`skipLogin` lazy closure in `nandosOrder.ts`**: Standard JS closure over `let` variable. Declaration and mutation visible within a few lines.
- **`tryDismissSuggestions`/`dismissSuggestions` two-layer naming in `nandosOrder.ts`**: Standard extract-and-wrap pattern. `try` prefix signals "returns success/failure."
- **Bare `sleep(TIMINGS.modalWait)` calls in `nandosOrder.ts`**: Constant name `modalWait` and surrounding context make purpose clear.
- **`run()` step blocks lack section markers in `nandosOrder.ts`**: Step names ARE the section markers. Each `.step()` call is a clear visual boundary.
- **`navigateToCategory` no explicit timeout in `nandosOrder.ts`**: Default timeout adequate. Over-specifying adds noise.
- **`URLS` object undocumented in `nandosOrder.ts`**: One-key object, purpose obvious from usage.
- **`dumpHtml` `writeFile` uncaught in `dump.ts:19`**: This is a debugging tool called intentionally. If it fails, the developer should know immediately rather than having the failure hidden in a warning.
- **`SAFE_MODE` read at module load time in `nandosOrder.ts`**: Standard Docker pattern — env vars are fixed for the container's lifetime. Module loads once per process. Not testable in isolation, but that's not a requirement (e2e tests control env before module load).
- **`detectTurnstile` exported but only used internally in `turnstile.ts`**: May be useful for future tasks that want detect-without-click. One extra export is harmless.
- **`dismissSuggestions` discards `tryDismissSuggestions` result in `nandosOrder.ts`**: Non-fatal by design — suggestions modal may not appear. Inner function already logs a warn.
- **Defaulting `needs` to `[]` in task config**: Requiring `needs: []` explicitly when a task needs no vault data documents the intent ("I checked and this task needs nothing"). Defaulting to `[]` makes vault loading opt-in, which hides the fact that the decision was made. Tasks that use the vault should require `needs`, and explicitly writing `needs: []` for vault-free tasks is a one-line cost for clear intent. Use `needsFromSchema(schema)` to derive needs when a schema exists.
