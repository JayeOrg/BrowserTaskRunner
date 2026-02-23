---
description: Run full validation (lint + build + test:coverage) and fix any failures. Use when ready to verify everything passes before committing.
disable-model-invocation: true
---

# Validate

Run `npm run validate` (lint + build + test:coverage). If anything fails, fix it and re-run until clean.

## Process

1. **Run validation**:

```bash
npm run validate
```

2. **On failure**: Read the error output carefully. Fix the root cause — don't suppress warnings or skip checks.

   - **Lint failures**: Fix the code, don't disable rules. Run `npm run lint` to confirm.
   - **Type errors**: Fix the types. Run `npm run typecheck` to confirm.
   - **Build failures**: Check for missing imports, bad paths. Run `npm run build` to confirm.
   - **Test failures**: Read the failing test and source. Fix the bug or update the test if the behavior intentionally changed. Run `npm run test` to confirm.

3. **Re-run validation**: After fixes, run `npm run validate` again. Repeat until fully clean.

4. **Report**: Output a summary of what passed, what failed and was fixed, and final coverage numbers.

## Rules

- Never skip or disable a check to make validation pass.
- Never use `--no-verify`, `@ts-ignore`, `eslint-disable`, or similar suppressions unless the underlying issue is genuinely unfixable.
- Fix failures in the order they appear — earlier failures (lint, types) often cause later ones (build, tests).
- If a test fails due to an intentional behavior change, update the test — but explain what changed and why.
