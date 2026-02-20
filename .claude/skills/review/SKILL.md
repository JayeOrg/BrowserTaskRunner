---
description: Review test coverage, DX, or readability. Use for codebase-wide audits — test review, DX review, or persona-based DX review.
---

# Reviews

Three review modes: test coverage review, DX review, and persona-based DX review. Each follows a structured process.

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

3. **Triage**: Classify each finding as **Will**, **Won't**, or **Needs Clarification**. Check `REJECTED.md` first — skip anything already documented there.

   For each finding, provide: problem description (2-3 sentences, self-contained), options table (`#`, `Option`, `Description`, `Tradeoffs`), and recommendation.

4. **Present**: Write triage to `.claude/dx-review-plan.md` AND output identical content to chat. Number items continuously across all sections. **Stop and wait for user response.**

   Rules:
   - Never assume implicit approval — every item needs explicit confirmation
   - Write Won't items to `REJECTED.md` immediately as user confirms
   - Keep iterating until every item is sorted into Will or Won't
   - Re-check `REJECTED.md` when presenting subsequent batches

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

---

## Persona-Based DX Review

Evaluate DX by creating developer personas and narrating their journeys through realistic tasks. Surfaces friction, naming traps, documentation gaps, and implicit conventions.

Use this instead of DX Review when assessing **onboarding and discoverability** rather than code-level readability. Use both for comprehensive coverage.

**This skill is independent of DX Review.** Do not reference `dx-review-plan.md` or prior review output.

### Process

1. **Deep exploration**: Launch an Explore agent (`very thorough`) to build a comprehensive codebase picture: all READMEs, AGENTS.md, REJECTED.md, entry points, a representative task + tests, CLI commands, build pipeline, Docker setup.

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

5. **Implement**: Track approved items with TodoWrite. Run `npm run validate`. Update AGENTS.md and REJECTED.md as appropriate.

### Learnings

- Cross-cutting env var chains are a common trap — trace: CLI flag -> process.env -> docker-compose -> task read
- Vault project name must match everywhere: task `project` field, `.env` token, CLI commands, README
- Persona journeys must reference real code — generic observations aren't actionable
