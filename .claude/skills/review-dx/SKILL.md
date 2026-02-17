---
description: Review DX and readability across the codebase. Use when assessing code quality, naming, consistency, and developer experience after significant changes.
---

# DX & Readability Review

Review the codebase for developer experience and readability. Every finding must result in either a code fix or a documented rationale for keeping the current code.

## Process

### 1. Explore (parallel)

Launch **one parallel Explore agent per module** (all `run_in_background: true`). Each agent reads every file in its module and evaluates:

1. **Naming** — Are variables, functions, types, and files named clearly?
2. **Code flow** — Is control flow easy to follow? Are functions ordered logically?
3. **Comments** — Missing where non-obvious, excessive where self-evident?
4. **Error handling** — Are errors clear and actionable?
5. **API surface** — Is the exported interface intuitive for callers?
6. **Consistency** — Do similar things use similar patterns across the codebase?
7. **Gotchas** — Anything that would trip up a new contributor?

Agent prompt template: "Read all files in [module]. For each file note naming, flow, comments, error handling, API surface, consistency, and gotchas. Give specific line references and concrete suggestions."

| Agent | Module         | Files                                                                   |
| ----- | -------------- | ----------------------------------------------------------------------- |
| 1     | Framework      | `stack/framework/*.ts`                                                  |
| 2     | Browser        | `stack/browser/*.ts`                                                    |
| 3     | Extension      | `stack/extension/**/*.ts`, `manifest.json`                              |
| 4     | Projects       | `stack/projects/**/*.ts`                                                |
| 5     | Vault          | `stack/vault/**/*.ts`, `stack/vault/README.md`                          |
| 6     | Tests & Config | `tests/**/*.ts`, `vitest.config.ts`, `eslint.config.ts`, `package.json` |

**Note:** These agents are explore-only — they read and report findings but do not make changes.

### 2. Poll for completion

After launching all agents, poll their output files in a loop until every agent has finished:

1. Wait ~30 seconds, then use `Bash` with `tail -1` on each agent's output file to check for completion signals.
2. Report progress to the user after each poll cycle: "3/6 agents complete (Framework, Browser, Vault). Waiting on Extension, Projects, Tests."
3. Once an agent completes, immediately read its full output (via `Read`) so you can begin triaging its findings while other agents finish.
4. Repeat until all 6 agents are done.

This keeps the user informed and lets you pipeline triage work with still-running agents.

### 3. Triage findings

After all agents complete, read each output and classify every finding as:

- **Will** — Change is clearly beneficial. You're recommending this be implemented.
- **Won't** — There's a good reason to keep the current code. You're recommending this be skipped and documented.
- **Needs Clarification** — Genuinely ambiguous, depends on user preference, or has significant tradeoffs that could go either way.

**Important rules:**
- List **every individual finding** — do not group findings. If two files have the same issue, list them separately with their own line numbers.
- Collapse true **duplicates** (same file, same issue) into one entry.
- Check `REJECTED.md` before triaging — if a finding is already documented there (in either the "Won't Fix" or "Failed Approaches" sections), skip it silently.

### 4. Present compiled list for user review

**Do NOT make any code changes yet.** Write the full triage to a file at `.claude/dx-review-plan.md` and also output it to the user. This file persists across sessions so progress is never lost to context compaction.

```
# DX Review — <date>

## Summary
<3-5 bullet overview>

## Will
| # | File:Line | Description | Tradeoffs | Why |
|---|-----------|-------------|-----------|-----|
| 1 | `path.ts:42` | What the change is (2-3 sentences describing the current state and the proposed change) | Any downsides or risks of making this change | Why this improves DX |

## Won't
| # | File:Line | Finding | Rationale |
|---|-----------|---------|-----------|
| 1 | `path.ts:42` | What was flagged | Why we're recommending keeping the current code |

## Needs Clarification
| # | File:Line | Finding | Question |
|---|-----------|---------|----------|
| 1 | `path.ts:42` | What was flagged | The specific question or tradeoff the user needs to decide on |
```

**Formatting rules:**
- Number items **continuously across all three sections** (e.g. if Will ends at #29, Won't starts at #30, Needs Clarification continues from there). This lets the user reference any finding by a single number.
- Every item gets a file path and line number.
- Descriptions should be hearty (2-3 sentences), not terse.
- The Tradeoffs column captures risks, downsides, or complexity cost of the change.

**Then stop and wait for the user's response.** The user will review the list and respond with their decisions:
- Which **Will** items to implement (confirm, remove, or move to Won't)
- Which **Won't** items to accept (confirm for REJECTED.md), override (move to Will), or ask about
- Which **Needs Clarification** items to resolve (move to Will, Won't, or provide further direction)

**Keep iterating until every item is explicitly sorted into Will or Won't.** If the user asks for clarification on any item, answer the question and wait for their decision. If there are still unresolved Needs Clarification items after the user's response, present the remaining items again. Only proceed to implementation once every finding has been assigned a final disposition.

**Write Won't items to `REJECTED.md` immediately** as the user confirms them (don't batch them until the end). This prevents loss if context compacts mid-session.

Update `.claude/dx-review-plan.md` after each user response to reflect their decisions (mark items as confirmed-Will, confirmed-Won't, or still-pending).

Do not proceed to implementation until the user has responded and all items are resolved.

### 5. Apply user decisions

After the user responds with their decisions:

1. Won't items should already be in `REJECTED.md` (written immediately in step 4). Verify they're all there.
2. Do **not** add anything to `REJECTED.md` that the user hasn't explicitly confirmed as Won't.

**Use TodoWrite** to track implementation progress. Create one todo item per confirmed Will item (or group trivially related items). Mark each as completed immediately after applying it. This survives context compaction and keeps the user informed.

**Implementation agents run in dependency order, not fully parallel.** This prevents cross-module type conflicts:

1. **Phase 1 — Framework** (runs first, since other modules import from it):
   - Launch one agent for `stack/framework/` Will items
   - Wait for completion before proceeding

2. **Phase 2 — Independent modules** (run in parallel after Framework completes):
   - Launch agents for Browser, Extension, and Vault Will items in parallel
   - Tests & Config items can run in this phase too

3. **Phase 3 — Projects** (runs last, imports from framework + browser + extension):
   - Launch one agent for `stack/projects/` Will items

**Each implementation agent must:**
- Apply the code changes for its assigned Will items
- **Update tests that directly test changed code.** If a function's signature, return type, or error message changes, update the corresponding test assertions in `tests/`. Don't leave test updates for later.
- **Run its module's tests** via `npx vitest run tests/unit/<module>` (not just `tsc --noEmit` and eslint). Report any failures.
- Read `.claude/dx-review-plan.md` to see the full list of items assigned to it.

Agent prompt template: "Read `.claude/dx-review-plan.md` for context. Apply the following Will items: [list of #numbers and descriptions]. For each change, also update any tests in `tests/` that assert on the changed behavior. After all changes, run `npx vitest run tests/unit/<module>` and report results."

### 6. Validate

Run `npm run validate` as the final step to confirm all fixes pass lint, build, and tests. Delete `.claude/dx-review-plan.md` after validation passes.

## Learnings

- **`z.infer` on empty schemas**: `z.infer<typeof z.object({})>` produces `Record<string, never>`, which breaks when intersected (`&`) with discriminant types like `{ type: "ping" }` because the `never` index signature conflicts with the literal `type` key. Don't suggest deriving types from empty zod schemas.
- **`exactOptionalPropertyTypes`**: This tsconfig flag means `error?: string` cannot accept `undefined` — the property must be absent or be a `string`. When refactoring code that conditionally includes optional properties, use an `if` branch that omits the property entirely rather than assigning `undefined`.
- **ESLint `no-nested-ternary`**: When fixing display/visibility logic, extract a helper function instead of using nested ternaries. This also improves testability.
- **ESLint `id-length`**: The project enforces a minimum identifier length of 2. Single-char names like `e` in `.map(e => ...)` will fail lint — use descriptive names like `inner`.
- **Update tests alongside code**: When changing error messages (e.g., differentiating vault decryption errors) or adding new return fields (e.g., error details in `waitForFirst`), update corresponding test assertions in the same batch. Check tests before running validate to avoid unnecessary iteration.
- **Read fix targets before applying**: Some fixes that look straightforward on paper (like schema derivation) break due to subtle type system interactions. Always read the target file first and consider the full type context before applying.
- **Agents must update tests for their changes**: When an agent changes a function's return type, error message, or behavior, it must also update the corresponding test assertions. Leaving test updates for later causes cascading failures at `npm run validate` time that are tedious to debug.
- **Dependency-ordered implementation prevents type conflicts**: Parallel agents that change shared types (e.g. one agent changes a return type from Buffer to string, another agent imports that function) create conflicts neither agent can see. Running framework first, then independent modules, then downstream modules eliminates this.
- **Write Won't items to REJECTED.md immediately**: Don't batch them. Context compaction can lose item descriptions if they're only in the conversation history. Writing to disk as items are confirmed preserves them.
