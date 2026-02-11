---
description: Review DX and readability across the codebase. Use when assessing code quality, naming, consistency, and developer experience after significant changes.
---

# DX & Readability Review

Review the codebase for developer experience and readability. Every finding must result in either a code fix or a documented rationale for keeping the current code.

## Process

### 1. Explore (parallel)

Launch **one parallel Explore agent per module** (all `run_in_background: true`), one per module. Each agent reads every file in its module and evaluates:

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

### 2. Triage findings

After all agents complete, read each output and classify every finding as:

- **Fix** — Change is clearly beneficial, no trade-off. Make the fix immediately.
- **Won't fix** — There's a good reason to keep the current code. Document the rationale in `AGENTS.md` (under the relevant section) or in a comment near the code, so future reviewers don't re-raise it.
- **Ask** — Genuinely ambiguous. Present to the user for a decision.

### 3. Apply fixes

Make all "Fix" changes directly. Run `npm run validate` after to confirm nothing broke.

### 4. Output the report

Output the report directly in the chat (do NOT write to a file). Structure:

```
# DX Review — <date>

## Summary
<3-5 bullet overview>

## Fixes Applied
| # | File | Change | Why |
|---|------|--------|-----|
| 1 | ... | ... | ... |

## Won't Fix (documented)
| Finding | Rationale | Documented where |
|---------|-----------|-----------------|
| ... | ... | AGENTS.md / inline comment |

## Open Questions
<anything in the "Ask" category, for user decision>
```

Number all fixes sequentially across modules.

### 5. Validate

Run `npm run validate` as the final step to confirm all fixes pass lint, build, and tests.
