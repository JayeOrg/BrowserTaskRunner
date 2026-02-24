# How Code Gets Reviewed

This project uses layered, automated review tooling so that human reviewers spend time on design and intent — not chasing formatting, missing tests, or convention violations. Every tool has a distinct job. None overlap.

---

## The Narrative: What Happens When You Open a PR

### Act 1: Instant Automated Feedback (seconds)

The moment a PR is opened, three GitHub Actions fire in parallel:

**Danger JS** ([dangerfile.ts](dangerfile.ts), [workflow](.github/workflows/danger.yml)) is the bouncer. It enforces structural hygiene before anyone reads a line of code:

- Fails PRs over 800 lines, warns over 400 — large PRs get lower review quality
- Warns if `stack/` code changed but `tests/` didn't
- Flags high-risk file changes (vault/crypto, infrastructure, Docker, CI pipelines, extension commands)
- Catches convention violations: co-located tests in `stack/` (must be in `tests/`), barrel/index files in `stack/`
- Posts a **change map** grouping files by module area (Browser, Extension, Framework, Projects, Vault, Infra, Tests, CI/CD)

**Difftastic** ([workflow](.github/workflows/difftastic.yml)) is the noise filter. It uses AST-level parsing to classify every changed file as either semantic (real logic change) or cosmetic (formatting, whitespace, reordering). Posts a sticky comment telling reviewers which files need real attention and which can be safely skimmed.

**Review Metrics** ([workflow](.github/workflows/review-metrics.yml)) checks whether the requested reviewer is overloaded. If they already have 5+ open PRs awaiting review, it posts a warning suggesting reassignment.

After these three finish, a reviewer opening the PR already knows: how big it is, which files are risky, which changes are semantic vs cosmetic, and whether they're overloaded. They haven't read a single line of code yet.

### Act 2: AI Review (minutes)

Two AI reviewers examine the PR with different lenses:

**Claude Code Action** ([workflow](.github/workflows/ai-review.yml)) reads the full diff with the project's [AGENTS.md](AGENTS.md) conventions loaded. It reviews for:

- Bugs, logic errors, edge cases
- Convention adherence (import direction, module separation, step runner patterns)
- Security: injection risks, path traversal, secrets in code, unsafe eval/deserialization, WebSocket issues, vault/crypto concerns
- Only flags real issues — no hypotheticals

Claude is the convention enforcer. It knows the project's rules because it reads them.

**CodeRabbit** ([config](.coderabbit.yaml)) provides the structural overview. It posts:

- A 2-3 sentence summary of the PR's intent
- A **walkthrough** grouping changes by logical concern (not alphabetically)
- Inline comments from path-scoped instructions that teach it the codebase architecture

CodeRabbit's path instructions are tuned per module: vault changes get crypto scrutiny, extension commands get "is this generic enough?" checks, project tasks get convention checks, tests get coverage evaluation. This is the reviewer's reading guide — it tells you *what order* to read files in.

Why two AI reviewers and not one? Claude is better at deep convention and security analysis because it ingests AGENTS.md. CodeRabbit is better at structured walkthroughs and path-scoped review because that's its product design. Codex was originally a third reviewer but was removed — it overlapped with Claude and had less project-specific context.

### Act 3: Human Review (the part that matters)

By the time a human opens the PR, the grunt work is done. They have:

1. A **change map** (Danger) showing which areas of the codebase are affected
2. A **structural diff summary** (Difftastic) telling them which files have real vs cosmetic changes
3. A **walkthrough** (CodeRabbit) providing a logical reading order
4. **Inline AI comments** (Claude + CodeRabbit) flagging bugs, security issues, and convention violations
5. **Automated warnings** about PR size, missing tests, and high-risk files

The human reviewer focuses on: Does this design make sense? Is the approach right? Are there architectural concerns the AI couldn't catch?

---

## The `/review` Skill: Deep Manual Audits

The `/review` skill ([SKILL.md](.claude/skills/review/SKILL.md)) is for comprehensive, on-demand audits — not per-PR review. It has four modes, each for a different kind of codebase health check.

### Test Coverage Review

Runs `npm run test:coverage`, then launches parallel agents to examine each test area against its source code. Evaluates coverage gaps, edge cases, assertion quality, naming, and readability. Triages findings into Add/Improve/Won't-fix/Ask, applies changes, and validates coverage didn't decrease.

### DX Review

Launches parallel agents across every module in `stack/`. Evaluates naming, code flow, error handling, API surface, and gotchas. Every finding gets a structured format: problem description, options table with tradeoffs, and a recommendation. Writes findings to `.claude/dx-review-plan.md`, requires explicit user approval on every item, implements in dependency order (Framework first, then independent modules, then Projects), and validates with `npm run validate`.

### Persona-Based DX Review

Creates developer personas (new contributor, extension developer, ops/debugger, reviewer, task author) and narrates their realistic journeys through the codebase. Surfaces friction, naming traps, documentation gaps, and implicit conventions. Complementary to DX Review — this one tests onboarding and discoverability.

### Task Review

Checks task files against 16 convention items: TASK constant naming, vault project consistency, needsFromSchema usage, step function signatures, runner.execute() return, magic string extraction, utility usage, Cloudflare DOM clicks, SAFE_MODE presence, closure hygiene, and E2E test patterns. Reports pass/fail with specific line numbers.

---

## Local Hooks: Guardrails During Development

The project's [settings](.claude/settings.json) enforce two hooks that run during Claude Code sessions:

- **PostToolUse** (Edit/Write): Auto-formats `.ts`, `.json`, `.md` files with Prettier
- **PreToolUse** (Edit/Write): Blocks editing `.env` or `package-lock.json`

These prevent common mistakes from ever reaching a PR.

---

## How the Tools Relate

```
Development Time                    PR Time                          On-Demand
─────────────────                   ───────────────────              ──────────

Local hooks                         Danger JS                       /review test
 ├─ Prettier auto-format             ├─ PR size gates                 └─ Coverage audit
 └─ .env edit prevention             ├─ Missing test warnings
                                     ├─ High-risk file flags         /review dx
                                     ├─ Convention checks             └─ DX audit
                                     └─ Change map
                                                                    /review persona
                                    Difftastic                       └─ Onboarding audit
                                     └─ Semantic vs cosmetic
                                                                    /review task
                                    Claude Code Action               └─ Convention check
                                     ├─ Convention enforcement
                                     └─ Security analysis

                                    CodeRabbit
                                     ├─ Logical walkthrough
                                     └─ Path-scoped inline review

                                    Review Metrics
                                     └─ Reviewer load warning
```

---

## Design Decisions

**Why not one AI reviewer?** Claude reads AGENTS.md and enforces project-specific conventions. CodeRabbit provides structured walkthroughs with path-scoped instructions. Different strengths, no overlap.

**Why Danger JS instead of just AI review?** Danger catches structural issues (PR size, missing tests, barrel files, co-located tests) deterministically. AI reviewers sometimes miss mechanical violations. Danger never misses them.

**Why Difftastic?** Line-based diffs show formatting changes as massive red/green noise. AST-based diffs tell you which files have real logic changes. This is the single biggest fatigue reducer for large PRs.

**Why not enforce semantic conventions in Danger?** Danger is text-matching heuristics. It can detect barrel files and co-located tests. It cannot check whether `run()` returns `runner.execute()` directly, or whether step functions use the right parameter signature. Semantic convention enforcement stays with AI reviewers.

---

## Known Gaps

1. **No cross-file semantic chunking.** No tool groups "the handler + route + test for a new endpoint" as one reviewable unit. CodeRabbit's walkthrough approximates this in text, but there's no GUI.
2. **No sub-file reading progress.** File-level tracking exists, but not "I've reviewed the auth changes in this file but not the logging changes."
3. **No test-implementation pairing.** Tests in `tests/` mirror `stack/`, but no tool presents them side-by-side in review.
4. **Difftastic edge cases.** Binary files classified as cosmetic, deleted/new files skipped.
5. **Sticky comment supply chain.** `marocchino/sticky-pull-request-comment` is pinned to a SHA but maintained by a solo developer.
