---
description: Prepare changes for PR review. Creates branch, runs local Danger checks, splits commits, validates, pushes, and opens a PR.
---
# Prep Review

Prepare the current working changes for PR review. Creates a branch if on main, checks for Danger violations, splits changes into logical commits, validates, pushes, and opens a well-structured PR.

## Process

### 1. Assess changes

Run `git status` and `git diff --stat` to see all staged, unstaged, and untracked changes.

If there are no changes, stop and tell the user.

### 2. Identify stories

Each PR should tell a single story — one coherent reason to exist that a reviewer can understand from the title alone. Examine all changes and group them by narrative:

- What distinct "whys" are present? A bug fix, a new feature, a refactor, a CI change, and a dependency update are five different stories even if they're all small.
- Changes that only make sense together belong in the same story (e.g., a framework change + the tests for it + the project code that uses it).
- Changes that are independently valuable belong in separate stories (e.g., a CI workflow fix has nothing to do with a vault feature addition).

**Decision: single PR or multi-PR?**

Split into multiple PRs if ANY of these are true:
- Changes serve more than one distinct purpose (e.g., "fix bug" + "add feature" + "update CI")
- Changes touch unrelated module areas with no dependency between them
- Total lines exceed 800 and the changes have natural seams

Keep as a single PR if:
- All changes serve one coherent purpose, even if they span multiple modules
- Changes are tightly coupled and splitting would require duplicating context
- Total changes are small (under ~400 lines) and tell one story

If splitting: proceed to **Multi-PR splitting** below, then return here at step 3 for each PR's subset.
If single PR: continue to step 3.

### 3. Branch management

If on `main`, create a new branch:
- Name: `claude/<descriptive-slug>` derived from the PR's story
- Slug: lowercase, hyphen-separated, 3-6 words max
- Examples: `claude/add-vault-audit-command`, `claude/fix-extension-timeout-handling`

If already on a non-main branch, stay on it.

### 4. Local Danger checks

Run these checks against all changed files (staged + unstaged + untracked).

**4a. PR size**

Count total added + deleted lines using `git diff --stat`.

- **Over 800 lines**: This single-story PR is too large. Look for sub-stories that can be extracted. If truly indivisible, include a size warning in the PR description.
- **Over 400 lines**: Note the warning. Include a size warning in the PR description.

**4b. Convention violations (fix immediately)**

- **Co-located tests**: Any `.test.ts` or `.spec.ts` files inside `stack/` must be moved to the corresponding `tests/` location before committing.
- **Barrel files**: Any new `index.ts` files inside `stack/` must be removed — refactor imports to use the actual source module.

Fix these before proceeding. Do not just warn.

**4c. Missing tests**

If any `stack/` files changed (excluding `.md`) but no `tests/` files changed, note this for the PR description. Do not abort.

**4d. High-risk files**

Flag any files matching these patterns:

| Pattern | Label |
|---------|-------|
| `stack/vault/crypto.ts` | cryptographic operations |
| `stack/vault/**` | vault/secrets |
| `stack/infra/**` | infrastructure |
| `.env*` | environment config |
| `**/docker-compose.yml` | Docker Compose |
| `**/Dockerfile` | Dockerfile |
| `stack/extension/messages/commands/**` | extension command |
| `.github/workflows/**` | CI/CD pipeline |

Collect the list for the PR description.

### 5. Split and commit

Group changes by module area, then by logical concern within each area:

| Area | Path prefix |
|------|-------------|
| Browser (WS bridge) | `stack/browser` |
| Extension (Chrome automation) | `stack/extension` |
| Framework (orchestration) | `stack/framework` |
| Projects (site-specific tasks) | `stack/projects` |
| Vault (secrets) | `stack/vault` |
| Infra (Docker/startup) | `stack/infra` |
| Tests | `tests` |
| CI/CD | `.github` |
| Root config | everything else |

**Commit rules:**

- Tests go with the code they test, not in a separate commit. Map `tests/unit/<module>/` → `stack/<module>/`, `tests/integration/<module>/` → `stack/<module>/`, `tests/e2e/projects/` → `stack/projects/`.
- Root config changes go with the module they support, or standalone if independent.
- Single-area small changes get a single commit. Do not over-split.
- Commit order: dependencies first (framework, infra), then features, then standalone tests, then config/docs.
- Commit messages: imperative mood, lowercase start, no period, first line under 72 chars. Add a body paragraph after a blank line if the change needs explanation.

**Self-review each commit** against the Reviewer Checklist from AGENTS.md before staging. Only check items relevant to the files being committed:

- `TASK` constant with `name` matching filename and `displayUrl`
- `project` matches vault project name
- `needs: needsFromSchema(schema)` — derived from Zod schema
- Step functions use `log: StepLogger` as first parameter
- `run()` returns `runner.execute()` directly
- Magic strings extracted to named constants
- DOM clicks for form submission on Cloudflare-protected sites
- E2e tests use `setupTaskRunTest()`, mock both `timing.js` and `poll.js`, use `pauseOnError: false`

### 6. Validate

Run `/validate`. If it fails, fix and re-validate before continuing.

### 7. Push

Push the branch to remote:

```bash
git push -u origin HEAD
```

### 8. Create PR

Create a PR to `main` using `gh pr create`. Use this structure for the body:

```
## Summary
- (1-3 bullets: why these changes exist, not what files changed)

## Change Map
| Area | Files Changed |
|---|---|
| (area) | (count) |

## High-Risk Files
- `path/to/file` (risk category)
(or "None")

## Missing Tests
(note if stack/ changes lack tests/ changes, or "All changes have corresponding tests")

## Size
(total lines changed — include warning if >400)

## Reviewer Notes
- (anything a reviewer should focus on)
- (relevant Reviewer Checklist items that apply)

## Test Plan
- [x] `npm run validate` passes
- [ ] (any manual verification steps)
```

Set the PR title to a concise imperative description under 72 chars.

## Multi-PR splitting

When step 2 identifies multiple stories, split them across separate branches and PRs. Each PR tells one story and is independently reviewable.

### What is a story?

A story is a set of changes with one coherent "why." Test it: can you write a PR title that accurately describes everything in this set without using "and"? If not, it's multiple stories.

**Good stories** (one PR each):
- "Remove third-party sticky-comment action from difftastic workflow"
- "Add vault key rotation CLI command"
- "Fix turnstile iframe detection timeout"

**Bad stories** (should be split):
- "Update CI and add vault rotation" — two unrelated concerns
- "Refactor framework logging and add new task" — refactoring is independently valuable

### Splitting process

1. **Record original state**: Before anything else, capture the full list of changed files:
   ```bash
   git status --short | awk '{print $NF}' > /tmp/split-prs-original-files.txt
   git diff --stat HEAD
   ```

2. **Back up all changed files** preserving directory structure:
   ```bash
   mkdir -p /tmp/split-prs-backup
   for file in <each changed/new file from git status>; do
     mkdir -p "/tmp/split-prs-backup/$(dirname "$file")"
     cp "$file" "/tmp/split-prs-backup/$file"
   done
   ```

3. **Stash everything**: `git stash --include-untracked` to save all changes.

4. **Assign each changed file to a story**. Files that serve multiple stories go with the story they primarily support. If a file is genuinely shared (e.g., `package.json` gains a dep needed by story A), it goes with that story.

5. **Order stories by dependency**: If story B depends on story A's changes, A goes first. Independent stories can be created in any order.

6. **For each story** (starting with the one that has no dependencies):

   a. From `main`, create a new branch: `claude/<slug-for-this-story>`

   b. Apply only this story's files from stash:
      - `git checkout stash -- <specific-files>` then unstage and restage as needed
      - For partial file changes (one file has changes for two stories), use `git checkout stash -- <file>` then manually edit to keep only this story's changes, staging the rest back to stash

   c. Run steps 3-4 (branch management, Danger checks) for this subset

   d. Run steps 5-8 (split/commit, validate, push, create PR)

   e. Return to `main`: `git checkout main`

7. **Verify file coverage** — confirm every originally changed file appears in at least one PR:
   ```bash
   # Collect files across all PR branches
   for branch in <each PR branch>; do
     git diff --name-only main...$branch
   done | sort -u > /tmp/split-prs-included.txt

   # Check every original file is covered
   while IFS= read -r file; do
     grep -qxF "$file" /tmp/split-prs-included.txt || echo "MISSING: $file"
   done < /tmp/split-prs-original-files.txt
   ```

   **If any files are MISSING**: stop and tell the user. Add the missing files to an existing PR or create a new one before proceeding.

8. **Restore working tree and preserve safety nets**:
   ```bash
   # Restore changes but KEEP the stash — do NOT use `git stash pop`
   git stash apply

   # Do NOT delete the backup or drop the stash.
   # Tell the user both are preserved:
   #   - Stash: `git stash list` / `git stash drop` when ready
   #   - Backup: /tmp/split-prs-backup/ — `rm -rf` when ready
   ```

9. **After all PRs are created**: List all PR URLs for the user. Note any dependency ordering (e.g., "merge PR #1 before PR #2"). Include a file coverage confirmation:
   ```
   File coverage: All N files included across M PRs. ✓
   Safety nets preserved:
     - git stash (run `git stash drop` when confirmed)
     - /tmp/split-prs-backup/ (run `rm -rf /tmp/split-prs-backup` when confirmed)
   ```

### When NOT to split

- All changes serve one purpose, even across many modules — a framework change + its tests + the project code that uses it is one story
- Changes are so intertwined that splitting would require duplicating context or break one of the PRs
- Forcing a split would create PRs that don't make sense on their own

### Dependencies between split PRs

- If PR B depends on PR A, note this in PR B's description under Reviewer Notes: "Depends on #N — merge that first."
- Create independent PRs first, dependent ones second.

## Rules

- Never force-push or amend existing commits on a shared branch.
- Never suppress lint, type, or test failures to make validation pass.
- Never commit `.env`, credentials, or secrets files.
- Split into multiple PRs when changes tell more than one story. Size is a secondary signal — semantic coherence is primary.
- Fix convention violations (co-located tests, barrel files) before committing — don't just warn.
