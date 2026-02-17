---
description: Review test coverage, comprehensiveness, DX, and readability. Use when assessing whether tests are thorough, well-structured, and easy to extend.
---

# Test Review

Review the test suite for coverage gaps, comprehensiveness, DX, and readability. Every finding must result in either a code fix, a new test, or a documented rationale for the current state.

## Process

### 1. Measure coverage

Run `npm run test:coverage` and capture the v8 coverage report. Record statement, branch, function, and line percentages per module. Note any uncovered lines.

### 2. Explore (parallel)

Launch **one parallel Explore agent per test area** (all `run_in_background: true`). Each agent reads every test file in its area AND the source files being tested, then evaluates:

1. **Coverage gaps** — Are there exported functions, branches, or error paths in the source that have no corresponding test?
2. **Edge cases** — Does the test cover boundary conditions (empty inputs, zero values, timeouts, concurrent operations)?
3. **Assertion quality** — Are assertions testing the right thing? Could a test pass despite broken code (false positives)?
4. **Test naming** — Do `describe`/`it` blocks clearly communicate what's being tested and why?
5. **Setup/teardown** — Is boilerplate minimal? Are fixtures and helpers well-used?
6. **Readability** — Is arrange/act/assert clear? Can a reader understand the test without reading the source?
7. **Consistency** — Do similar tests across files follow the same patterns?
8. **DX** — Is it easy to add a new test? Are mocks reusable? Is test data well-organised?

Agent prompt template: "Read all test files in [area] and their corresponding source files. For each test file evaluate: coverage gaps, edge cases, assertion quality, naming, setup/teardown, readability, consistency, and DX. Give specific line references and concrete suggestions."

| Agent | Area | Test files | Source files |
| ----- | ---- | ---------- | ------------ |
| 1 | Framework | `tests/unit/framework/*.test.ts` | `stack/framework/*.ts` |
| 2 | Browser | `tests/integration/browser/*.test.ts` | `stack/browser/*.ts` |
| 3 | Project utils | `tests/unit/projects/utils/*.test.ts` | `stack/projects/utils/*.ts` |
| 4 | Vault | `tests/unit/vault/*.test.ts` | `stack/vault/**/*.ts` |
| 5 | E2E | `tests/e2e/*.test.ts`, `tests/e2e/projects/*.test.ts` | `tests/e2e/fixtures/*.ts` |
| 6 | Fixtures | `tests/fixtures/*.ts` | (self-contained — assess reusability and API surface) |

### 3. Cross-check exclusions

Read `vitest.config.ts` coverage exclusions. For each excluded file, verify the rationale still holds:
- Is the file still trivial/declarative, or has logic been added since exclusion?
- If tested indirectly (e.g. CLI via spawned process), is that coverage adequate?
- Are there new files in covered modules that aren't yet tested?

### 4. Triage findings

After all agents complete, read each output and classify every finding as:

- **Add test** — Missing coverage that should exist. Write the test immediately.
- **Improve test** — Existing test that could be stronger (better assertions, edge cases, naming). Fix immediately.
- **Won't fix** — There's a good reason for the current state. Document the rationale in `vitest.config.ts` comments or `AGENTS.md`.
- **Ask** — Genuinely ambiguous. Present to the user for a decision.

### 5. Apply changes

Make all "Add test" and "Improve test" changes directly. Follow conventions from the `add-test` skill (test placement, mock patterns, vitest conventions).

### 6. Output the report

Output the report directly in the chat (do NOT write to a file). Structure:

```
# Test Review — <date>

## Coverage Summary
| Module | Stmts | Branch | Funcs | Lines | Uncovered |
|--------|-------|--------|-------|-------|-----------|
| ... | ... | ... | ... | ... | ... |

## Tests Added
| # | File | What it tests | Why |
|---|------|---------------|-----|
| 1 | ... | ... | ... |

## Tests Improved
| # | File | Change | Why |
|---|------|--------|-----|
| 1 | ... | ... | ... |

## Won't Fix (documented)
| Finding | Rationale | Documented where |
|---------|-----------|-----------------|
| ... | ... | vitest.config.ts / AGENTS.md |

## Open Questions
<anything in the "Ask" category, for user decision>
```

Number all items sequentially across sections.

### 7. Validate

Run `npm run test:coverage` as the final step. Confirm:
- All tests pass (237+ tests, 0 failures)
- Coverage percentages are equal to or higher than before
- No new lint or build errors
