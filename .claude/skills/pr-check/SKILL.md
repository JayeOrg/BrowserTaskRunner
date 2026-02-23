---
description: Check CI status of open PRs. Surfaces failures, extracts error messages, and suggests fixes.
---
# PR Check

Scan all open PRs in the repo and report their CI status. Surfaces failures with actionable error messages so you don't have to check the GitHub UI.

## Process

### 1. List open PRs

```bash
gh pr list --state open --json number,title,headRefName,author --template '{{range .}}#{{.number}} {{.title}} ({{.headRefName}}){{"\n"}}{{end}}'
```

If no open PRs, report "No open PRs" and stop.

### 2. Check each PR

For each open PR, run:

```bash
gh pr checks <number>
```

Categorize each PR as **failing**, **passing**, or **pending** based on its check results.

### 3. Report

Output a summary grouped by status. Always show failing PRs first.

**For failing PRs**, dig into each failed check:

```bash
gh run view <run-id> --log-failed
```

Extract the key error — not full logs, just the actionable line. Common patterns to look for:
- The first `Error:` or `error:` line
- The `##[error]` annotation
- Test assertion failures (`Expected ... Received ...`)
- Build errors (`TS\d+:`)

**Format:**

```
## PR Status

### Failing
| PR | Title | Failed Checks |
|---|---|---|
| #N | title | check-name-1, check-name-2 |

**#N — title**
- check-name: <one-line error summary>

### Passing
| PR | Title |
|---|---|
| #N | title |

### Pending
| PR | Title | Pending Checks |
|---|---|---|
| #N | title | check-name |
```

### 4. Suggest fixes

For recognized failure patterns, append a suggested fix:

| Pattern | Suggestion |
|---------|------------|
| `Unable to get ACTIONS_ID_TOKEN_REQUEST_URL` | Add `id-token: write` to workflow permissions |
| `Workflow validation failed...identical content to the version on the repository's default branch` | Merge the workflow file changes to main first — this is a chicken-and-egg issue |
| `TS\d+:` type error | Read the failing file and fix the type error |
| `Expected ... Received ...` test failure | Read the failing test and fix the assertion or source code |
| `eslint` / lint failure | Run `npm run lint` locally and fix |
| `ECONNREFUSED` / network error | Likely a flaky CI runner — re-run the check |
| `exit code 1` with no other context | Fetch more logs with `gh run view <id> --log` and look for the root cause |

## Rules

- Never re-run failed checks automatically — report and let the user decide.
- Show the most actionable information first: what failed, why, and how to fix.
- Keep error summaries to one line per check. Link to the full run for details.
- If a PR has no checks at all, note it — the workflow may not be triggering.
