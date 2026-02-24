---
description: Split uncommitted changes into multiple logical PRs, each telling a single coherent story. Use when there are uncommitted changes spanning multiple concerns that should be separate pull requests. Trigger on "create PRs", "make PRs", "split PRs", "PRs for changes", "ship these changes", or any request to turn working-tree changes into pull requests.
allowed-tools: Bash(git status*), Bash(git diff*), Bash(git ls-files*), Bash(git log*), Bash(git stash*), Bash(git checkout*), Bash(git add*), Bash(git commit*), Bash(git push*), Bash(git rm*), Bash(git branch*), Bash(gh pr create*), Bash(mkdir*), Bash(cp*), Bash(rm -rf /tmp/split-prs*)
---

# PRs

Split uncommitted changes into multiple pull requests, each telling a single coherent story.

## Context

- Branch: !`git branch --show-current`
- Status: !`git status --short`
- Changes: !`git diff --stat HEAD`
- Untracked: !`git ls-files --others --exclude-standard`
- Recent commits: !`git log --oneline -5`

## Workflow

### 1. Analyze

Read the full diff (`git diff HEAD`) and scan untracked files to understand every change.

### 2. Group

Cluster changes into PRs. Each PR answers one "why" — a single motivation a reviewer can hold in their head.

Grouping principles:
- **One story per PR.** If describing the PR needs "and" joining unrelated ideas, split it.
- **Group by reviewer attention.** Files that need the same level of scrutiny belong together. A rubber-stamp rename and a new feature require different attention — don't bury one inside the other.
- **Structural moves are their own story.** Relocating files, renaming directories, or reorganizing structure is a separate PR from changing content or adding new functionality.
- **Ripple updates vs new work.** When a change (like a reorg) forces updates to existing files (path references, imports, config adjustments), those conforming updates are a separate low-scrutiny PR from genuinely new content that needs real review.
- **New capabilities are their own story.** A new skill, a new framework module, or a new tool is distinct from the refactor that motivated it.
- **Plumbing vs porcelain.** Infrastructure changes (config, rules, CI, build) are a separate story from the features they support.
- **Tests go with the code they test.** Never a separate "tests" PR.
- **Docs go with the feature they document** only if the feature is in the same PR. Purely organizational doc work (moves, splits, restructuring) is its own PR.
- **Shared files go in the PR they most belong to.** When a file like AGENTS.md has changes for multiple PRs, put it in the one that drives the majority of its changes rather than splitting the file across branches.
- **Aim for ~300 lines per PR** when feasible. Don't artificially split a cohesive change, but do split when stories are genuinely distinct.

### 3. Propose

Present groupings as a numbered plan:

```
PR 1: <title>
  <one-line description>
  - path/to/file.ts (modified)
  - path/to/new.ts (new)
  - path/to/old.ts (deleted)

PR 2: <title>
  <one-line description>
  - ...
```

**Stop here. Wait for user confirmation before executing.**

### 4. Execute

One group at a time. The approach: back up changed files, stash everything, then for each PR create a branch from main and restore only that group's files.

#### Preparation (once)

```bash
# 1. Back up every changed/new file preserving directory structure
mkdir -p /tmp/split-prs-backup
for file in <each file that exists in working tree>; do
  mkdir -p "/tmp/split-prs-backup/$(dirname "$file")"
  cp "$file" "/tmp/split-prs-backup/$file"
done

# 2. Record deleted files (exist in HEAD but not working tree)
# 3. Stash everything
git stash --include-untracked
```

#### Per PR

```bash
# 1. Branch from main
git checkout -b <branch-name> main

# 2. Apply this group's changes
#    Modified/new: copy from /tmp/split-prs-backup/
#    Deleted: git rm <file>

# 3. Stage only this group's files
git add <files>

# 4. Commit
git commit -m "<message>"

# 5. Push + PR
git push -u origin <branch-name>
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<bullets>

## Test plan
<how to verify>
EOF
)"

# 6. Return to main
git checkout main
```

#### Verification (once, after all PRs created)

Confirm every originally changed file was included in at least one PR:

```bash
# 1. Collect all files that were in the original working-tree changes
original_files=(<list from git status --short recorded before stashing>)

# 2. For each PR branch, list the files changed vs main
for branch in <each PR branch>; do
  git diff --name-only main...$branch
done | sort -u > /tmp/split-prs-included.txt

# 3. Compare — every original file must appear in at least one PR
for file in "${original_files[@]}"; do
  grep -qxF "$file" /tmp/split-prs-included.txt || echo "MISSING: $file"
done
```

**If any files are MISSING**: stop and tell the user. Do not proceed to cleanup. The missing files must be added to an existing PR or a new one.

#### Cleanup (once, after verification passes)

```bash
# Apply stash to restore working tree, but keep the stash as a safety net
git stash apply

# IMPORTANT: Do NOT run `git stash drop` or `git stash pop`.
# The stash remains recoverable until the user confirms everything is correct.
# Tell the user: "Your original changes are restored. The stash is preserved
# as a safety net — run `git stash drop` once you've confirmed the PRs are correct."

# Keep the backup directory as a second safety net
# Tell the user: "Backup preserved at /tmp/split-prs-backup/ — remove it with
# `rm -rf /tmp/split-prs-backup` once you've confirmed everything."
```

### 5. Report

List each created PR with its title and URL.

Include a **File Coverage** section:

```
## File coverage
All N originally changed files are included across M PRs. ✓
(or: WARNING — the following files were NOT included in any PR: ...)

Stash and backup preserved for safety:
  - Run `git stash drop` to remove the safety stash
  - Run `rm -rf /tmp/split-prs-backup` to remove the backup
```

## Branch naming

Follow project conventions. If a Jira ticket is known, use `TICKET/description` format. Otherwise use descriptive kebab-case (e.g. `docs-reorganization`, `spec-driven-projects`).

## Error recovery

If any step fails:
1. Stop immediately — do not continue to the next PR
2. Return to main: `git checkout main`
3. Restore working tree from stash (but keep the stash): `git stash apply`
4. **Do NOT drop the stash or delete the backup** — leave both as safety nets
5. Report what failed, which PRs were already created, and remind the user:
   - Stash is preserved: `git stash list` to see it, `git stash drop` to remove when ready
   - Backup is preserved at `/tmp/split-prs-backup/`
