---
description: Review test coverage, DX, readability, or task conventions. Use for codebase-wide audits — test review, DX review, persona-based DX review, or task review.
---

# Reviews

Four review modes: test coverage review, DX review, persona-based DX review, and task review. Each follows a structured process.

## Test Review

Review the test suite for coverage gaps, comprehensiveness, DX, and readability.

### Process

1. **Measure coverage**: Run `npm run test:coverage` and record percentages per module.

2. **Explore (parallel)**: Launch one Explore agent per test area (all `run_in_background: true`). Each agent reads test files AND source files, evaluating: coverage gaps, edge cases, assertion quality, naming, setup/teardown, readability, consistency, DX.

   | Agent | Test files | Source files |
   | ----- | ---------- | ------------ |
   | Framework | `tests/unit/framework/*.test.ts` | `stack/framework/*.ts` |
   | Browser | `tests/integration/browser/*.test.ts` | `stack/browser/*.ts` |
   | Project utils | `tests/unit/projects/utils/*.test.ts` | `stack/projects/utils/*.ts` |
   | Vault | `tests/unit/vault/*.test.ts` | `stack/vault/**/*.ts` |
   | E2E | `tests/e2e/*.test.ts`, `tests/e2e/projects/*.test.ts` | `tests/e2e/fixtures/*.ts` |
   | Fixtures | `tests/fixtures/*.ts` | (self-contained) |

3. **Cross-check exclusions**: Read `vitest.config.ts` coverage exclusions. Verify each rationale still holds.

4. **Triage**: Classify each finding as **Add test**, **Improve test**, **Won't fix** (document rationale), or **Ask** (present to user).

5. **Apply**: Make all "Add test" and "Improve test" changes. Follow `/test` conventions.

6. **Report**: Output directly in chat (not to file):
   - Coverage summary table
   - Tests added (file, what, why)
   - Tests improved (file, change, why)
   - Won't fix (finding, rationale, documented where)
   - Open questions

7. **Validate**: Run `npm run test:coverage`. Confirm all pass, coverage equal or higher.

---

## DX Review

Review the codebase for developer experience and readability.

### Process

1. **Explore (parallel)**: Launch one Explore agent per module (discover via `ls -d stack/*/`), plus one for Tests & Config. Each reads all files and evaluates: naming, code flow, comments, error handling, API surface, consistency, gotchas.

2. **Poll for completion**: Wait ~30s, check output files, report progress. Read completed agents immediately to begin triaging.

3. **Triage**: Classify each finding as **Will**, **Won't**, or **Needs Clarification**. Check `docs/REJECTED.md` first — skip anything already documented there.

   Every item uses the same format regardless of classification:
   1. Problem description (2-3 sentences, self-contained — what and why it's a problem)
   2. Options table: `#`, `Option`, `Description`, `Tradeoffs` (what the tradeoff is and why it matters)
   3. Recommendation underneath the table

4. **Present**: Write triage to `.claude/dx-review-plan.md` AND output identical content to chat. **All items share one continuous numbering sequence** across Will, Won't, and Needs Clarification sections. **Stop and wait for user response.**

   Rules:
   - Never assume implicit approval — every item needs explicit confirmation
   - Write Won't items to `docs/REJECTED.md` immediately as user confirms
   - Keep iterating until every item is sorted into Will or Won't
   - Re-check `docs/REJECTED.md` when presenting subsequent batches

5. **Apply**: After all items resolved, implement confirmed Will items in dependency order:
   - Phase 1: Framework (other modules import from it)
   - Phase 2: Independent modules in parallel
   - Phase 3: Projects (imports from everything else)

   Each agent must update tests alongside code changes.

6. **Validate**: Run `npm run validate`. Delete `.claude/dx-review-plan.md` after pass.

### Learnings

- `z.infer` on empty schemas produces `Record<string, never>` which breaks intersections with discriminant types
- `exactOptionalPropertyTypes` means `error?: string` cannot accept `undefined` — property must be absent
- ESLint `no-nested-ternary`: extract a helper function instead
- ESLint `id-length`: minimum 2 chars — no single-char names in `.map()`
- ESLint `capitalized-comments`: every `//` line must start uppercase
- Always read fix targets before applying — schema derivation can break due to subtle type interactions
- Dependency-ordered implementation prevents cross-module type conflicts
- Trivial-but-correct fixes (lowercase comment, remove unused flag, name a magic number) are always worth recommending — never skip for being "too small"
- Never use "personal project", "only N callers", or "rare operation" as Won't-fix rationale — if the fix is correct, recommend it
- When recommending Won't fix, the rationale must be a genuine technical reason (e.g. "type system limitation"), not a scale argument

---

## Persona-Based DX Review

Evaluate DX by creating developer personas and narrating their journeys through realistic tasks. Surfaces friction, naming traps, documentation gaps, and implicit conventions.

Use this instead of DX Review when assessing **onboarding and discoverability** rather than code-level readability. Use both for comprehensive coverage.

**This skill is independent of DX Review.** Do not reference `dx-review-plan.md` or prior review output.

### Process

1. **Deep exploration**: Launch an Explore agent (`very thorough`) to build a comprehensive codebase picture: all READMEs, AGENTS.md, docs/REJECTED.md, entry points, a representative task + tests, CLI commands, build pipeline, Docker setup.

2. **Create personas and narrate journeys**: Create 3-5 personas with different backgrounds and tasks:

   | Persona | Background | Task type |
   |---------|-----------|-----------|
   | New contributor | Backend dev, first time | Add a new site/project end-to-end |
   | Extension developer | Chrome API expert | Add a new browser command |
   | Ops/debugger | DevOps, Docker | Debug a failing task |
   | Reviewer | Experienced TS dev | Review a PR first time |
   | Task author | Familiar with framework | Add a complex multi-step task |

   For each: where they start, what goes well, where they get stuck, what they figure out, what could prevent the friction. Use specific file paths and real names.

3. **Extract themes**: Summary table of recurring issues across personas.

4. **Present**: Output narratives and theme table in chat. **Do not make changes yet.** Wait for user approval.

5. **Implement**: Track approved items with TodoWrite. Run `npm run validate`. Update AGENTS.md and docs/REJECTED.md as appropriate.

### Learnings

- Cross-cutting env var chains are a common trap — trace: CLI flag -> process.env -> docker-compose -> task read
- Vault project name must match everywhere: task `project` field, `.env` token, CLI commands, README
- Persona journeys must reference real code — generic observations aren't actionable

---

## Task Review

Review task files in `stack/projects/` against the project's task conventions. Check every item below and report violations.

### Checklist

1. **`TASK` constant** — has `name` matching the filename (without `.ts`) and `displayUrl`
2. **`project`** — matches vault project name in `.env` and README
3. **`needs`** — uses `needsFromSchema(schema)` derived from the Zod schema, not a manual array
4. **`secretsSchema`** — set to the same Zod schema used for `needs`
5. **Step functions** — use `log: StepLogger` as the first parameter, registered via `runner.step(fn, ...args)`
6. **Named steps** — reused functions use `runner.named(subtitle, fn, ...args)` (e.g. `addMenuItem:PERi-Chip Wrap`)
7. **`run()` return** — returns `runner.execute()` directly
8. **Magic strings** — extracted to named constants (`SELECTORS`, `TIMINGS`, etc.)
9. **Utility usage** — uses `fillFirst`/`clickFirst`/`pollUntil` from `utils/` instead of manual loops
10. **DOM clicks for Cloudflare** — form submission on Cloudflare-protected sites uses DOM clicks (`clickFirst`, `browser.click`), not CDP clicks
11. **`SAFE_MODE` check** — present if the task has irreversible side effects
12. **No unnecessary closures** — step functions don't capture variables between steps; dependencies passed as arguments
13. **E2E tests** — use `setupTaskRunTest()` with command overrides
14. **E2E test mocks** — mock both `timing.js` and `poll.js`
15. **Test coverage** — happy path and key failure paths covered
16. **Tests use `pauseOnError: false`** — so errors throw immediately

### Process

1. Read the task file(s) being reviewed
2. Read the canonical example `stack/projects/botc/project.ts` for reference
3. Read the task's E2E tests if they exist
4. Check each item above. For each violation, report:
   - Which item failed
   - The specific line or pattern that's wrong
   - What the fix should be
5. If everything passes, say so

### Output Format

```
## Task Review: <filename>

PASS (N/N) or FAIL (N/N passed)

### Violations (if any)
- #3 `needs`: Manual array `["email", "password"]` — use `needsFromSchema(secretsSchema)`
- #8 Magic strings: `"input[type=email]"` on line 42 — extract to `SELECTORS`

### Notes (optional)
Any observations that aren't violations but worth mentioning.
```
