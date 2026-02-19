---
description: Review DX through developer persona journeys. Use when assessing onboarding friction, naming traps, missing docs, and implicit conventions by simulating real developer tasks.
---

# Persona-Based DX Review

Evaluate developer experience by creating fictional developer personas, assigning each a realistic task in the codebase, and narrating their journey from understanding to implementation. This surfaces friction, naming traps, documentation gaps, and implicit conventions that a standard code review misses.

## When to use

Use this instead of `/review-dx` when you want to assess **onboarding and discoverability** rather than code-level readability. This skill finds problems like:

- Naming inconsistencies across files that only surface when following a cross-cutting workflow
- Missing scaffolding, templates, or `.example` files
- Implicit conventions that aren't enforced by tooling
- Documentation that exists but is hard to discover or contradicts itself
- Broken chains where one file sets a value and another reads a different name

`/review-dx` is better for line-level code quality (naming, flow, comments, API surface). Use both for a comprehensive review.

**This skill is independent of `/review-dx`.** Do not read or reference `dx-review-plan.md` or any artifacts from `/review-dx` — the persona approach should discover issues fresh through simulated developer journeys, not from prior review output.

## Process

### 1. Deep codebase exploration

Launch an Explore agent with `very thorough` thoroughness to build a comprehensive picture of the codebase. The agent should read:

- All READMEs (root and per-module)
- AGENTS.md, REJECTED.md
- Key entry points and how the system works end-to-end
- A representative task file, its tests, and the test fixtures
- CLI commands and how tasks are run
- The build pipeline and Docker setup

The agent's goal is to understand **the developer experience** — what's clear, what's confusing, what's implicit vs explicit. It should note:

- How a new developer would discover things
- Pain points: naming inconsistencies, indirection, missing docs
- Implicit conventions with no tooling enforcement
- Cross-cutting patterns that span multiple files

### 2. Create personas and narrate journeys

Create 3-5 developer personas, each with a different background and a different realistic task. Good persona archetypes:

| Persona | Background | Task type |
|---------|-----------|-----------|
| New contributor | Backend dev, first time in codebase | Add a new site/project end-to-end |
| Extension developer | Frontend/Chrome API expert | Add a new browser command |
| Ops/debugger | DevOps, comfortable with Docker | Debug a failing task |
| Reviewer | Experienced TS dev | Review a PR for the first time |
| Task author | Familiar with the framework | Add a complex multi-step task |

For each persona, narrate a step-by-step journey:

1. **Where they start** — which file/doc they read first
2. **What goes well** — patterns that are easy to follow
3. **Where they get stuck** — naming traps, missing docs, implicit conventions, broken chains
4. **What they eventually figure out** — and how long it took / how much searching
5. **What could have prevented the friction** — specific, actionable improvement

Write the journeys in narrative form, not bullet lists. Use specific file paths, line numbers, and real names from the codebase. The journeys should feel like a realistic developer's internal monologue.

### 3. Extract themes

After writing all personas, extract a summary table of recurring themes:

```
| Theme | Where it surfaces | Suggested improvement |
|-------|-------------------|----------------------|
| Naming inconsistencies | Vault project names, env var names | Audit and align; add a glossary |
| Implicit conventions | Step names = function names | Lint rules or runtime assertions |
| ... | ... | ... |
```

### 4. Present to user

Output the full persona narratives and theme table directly in chat. **Do not make any code changes yet.** The user reviews and decides which improvements to implement.

### 5. Implement approved improvements

After the user approves specific improvements:

1. Use TodoWrite to track each approved item
2. Implement changes — these are typically:
   - Fixing naming inconsistencies (code + tests)
   - Adding missing documentation sections to AGENTS.md or module READMEs
   - Adding `.example` files or templates
   - Adding comments at key cross-module boundaries
   - Renaming flags/env vars for consistency across the chain
   - Adding checklists or reviewer guides to AGENTS.md
3. Run `npm run validate` to confirm everything passes
4. Update AGENTS.md and REJECTED.md as appropriate

### 6. Update AGENTS.md slash command list

If new documentation sections were added to AGENTS.md (checklists, cross-cutting patterns, etc.), verify the `/review-dx` and this skill's descriptions still accurately describe what they cover.

## Learnings

- **Cross-cutting env var chains are a common trap.** When a CLI flag sets one env var name but a task reads a different name, the chain is silently broken. Always trace the full path: CLI flag -> CheckOptions field -> process.env key -> docker-compose.yml -> task's process.env read.
- **Vault project name must match everywhere.** The task's `project` field, the `.env` token name (`VAULT_TOKEN_<PROJECT>`), the vault CLI commands in the README, and the README's "Vault project:" line must all be consistent. The framework's `resolveToken` does `project.toUpperCase().replace(/-/g, "_")` — so `monitor-botc` becomes `VAULT_TOKEN_MONITOR_BOTC`.
- **Pre-existing lint errors are common.** When running `npm run validate`, distinguish errors from your changes vs pre-existing ones by linting only changed files first: `npx eslint <file1> <file2> ...`.
- **ESLint `capitalized-comments` rule.** Comments must start with an uppercase letter. A comment like `// browser/ is the bridge` will fail — use `// Bridge module — ...` instead.
- **Persona journeys should reference real code.** Generic observations like "docs could be better" aren't actionable. "Sam reads botc/README.md which says `monitor-botc` but botcLogin.ts says `monitorBotcLogin` — the env var lookup will fail" is actionable and verifiable.
