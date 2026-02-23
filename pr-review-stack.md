# PR Review Stack: Reducing Reviewer Fatigue with GitHub Actions

A practical stack using existing tools to get as close as possible to a semantically-organised, fatigue-reducing code review experience — all wired through GitHub.

---

## The Stack at a Glance

| Category | Tool | What it does for fatigue |
|---|---|---|
| **Semantic PR summary & walkthrough** | CodeRabbit | Groups changes by logical concern, generates walkthrough |
| **Structural diffs** | Difftastic (via GH Action) | Strips cosmetic noise, shows only semantic changes |
| **PR hygiene & guardrails** | Danger JS (via GH Action) | Warns on large PRs, missing tests, risky file changes |
| **AI bug/security review** | CodeRabbit or Qodo Merge | Automated first-pass catches routine issues |
| **Reading progress tracking** | Reviewable | Per-file reviewed state, shows delta since last look |
| **Communication & notifications** | Axolo | Ephemeral Slack channels per PR, reduces context switching |
| **Review metrics & load monitoring** | LinearB or GitHub built-in insights | Tracks cycle time, identifies overloaded reviewers |
| **PR size enforcement** | Graphite or Danger JS | Encourages smaller, focused PRs |

---

## 1. Semantic PR Summary & Walkthrough (CodeRabbit)

This is the closest existing substitute for "break the PR into semantic chunks for me." CodeRabbit generates a structured walkthrough that groups changes by logical concern rather than listing files alphabetically.

### Setup

Install the CodeRabbit GitHub App from the marketplace, then add `.coderabbit.yaml` to your repo root:

```yaml
# .coderabbit.yaml
language: "en-US"
reviews:
  profile: "assertive"        # more thorough feedback
  high_level_summary: true     # top-level summary of what changed and why
  review_status: true          # progress indicator
  path_instructions:           # teach it your codebase structure
    - path: "src/api/**"
      instructions: "This is the API layer. Flag breaking changes to request/response contracts."
    - path: "src/core/**"
      instructions: "Core business logic. Scrutinise edge cases and error handling."
    - path: "**/*.test.*"
      instructions: "Test files. Check coverage of happy path, edge cases, and error states."
    - path: "migrations/**"
      instructions: "Database migrations. Flag irreversible changes and data loss risks."
  auto_review:
    enabled: true
    drafts: false
chat:
  auto_reply: true             # lets reviewers ask follow-up questions inline
```

### What you get

On every PR, CodeRabbit posts a comment with:

- **Summary**: 2-3 sentence overview of intent
- **Walkthrough**: Changes grouped by logical concern (e.g. "New auth endpoint", "Updated user model", "Added integration tests"), each with file links and descriptions
- **Sequence diagram**: For PRs involving flow changes (optional)
- **Inline comments**: Bugs, security issues, suggestions — directly on the diff

The walkthrough is the key piece — it gives the reviewer a logical reading order across files rather than alphabetical. Combined with the path instructions, it also surfaces "this migration is irreversible" or "this touches the API contract" front and centre.

### Approximating reading progress

CodeRabbit doesn't track what you've read, but you can combine it with GitHub's native "Viewed" checkboxes on the Files Changed tab. The walkthrough gives you the *order*, and GitHub's checkboxes give you the *progress*. Not perfect, but functional.

---

## 2. Structural Diffs — Strip the Noise (Difftastic)

Standard line-based diffs are a huge source of visual fatigue. A variable rename, a re-indent, or a moved function generates massive red/green noise that buries the real changes.

### GitHub Action setup

```yaml
# .github/workflows/difftastic.yml
name: Structural Diff Comment
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  difftastic:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Install difftastic
        run: |
          curl -L https://github.com/Wilfred/difftastic/releases/latest/download/difft-x86_64-unknown-linux-gnu.tar.gz | tar xz
          sudo mv difft /usr/local/bin/

      - name: Generate structural diff summary
        run: |
          # Get changed files
          FILES=$(git diff --name-only origin/${{ github.base_ref }}...HEAD)
          
          echo "## Structural Diff Summary" > diff_report.md
          echo "" >> diff_report.md
          echo "Files where difftastic detected **semantic** (non-cosmetic) changes:" >> diff_report.md
          echo "" >> diff_report.md
          
          SEMANTIC_COUNT=0
          COSMETIC_ONLY=0
          
          for f in $FILES; do
            if [ -f "$f" ]; then
              # Run difftastic, capture output
              DIFF_OUT=$(difft --display=inline origin/${{ github.base_ref }}..HEAD -- "$f" 2>/dev/null || true)
              if [ -n "$DIFF_OUT" ] && echo "$DIFF_OUT" | grep -q "changed"; then
                echo "- \`$f\` — has semantic changes" >> diff_report.md
                SEMANTIC_COUNT=$((SEMANTIC_COUNT + 1))
              else
                COSMETIC_ONLY=$((COSMETIC_ONLY + 1))
              fi
            fi
          done
          
          echo "" >> diff_report.md
          echo "**${SEMANTIC_COUNT} files with semantic changes**, ${COSMETIC_ONLY} files with cosmetic-only changes (formatting, whitespace, reordering)." >> diff_report.md

      - name: Post comment
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: difftastic-summary
          path: diff_report.md
```

### Why this matters

Difftastic uses tree-sitter to parse code at the AST level. It can tell the difference between "this function was moved down 40 lines" (cosmetic) and "this function's return type changed" (semantic). The summary tells reviewers which files they can safely skim and which need real attention.

For local use, developers can also configure Git to use difftastic:

```bash
# ~/.gitconfig
[diff]
  external = difft
```

---

## 3. PR Hygiene & Guardrails (Danger JS)

Danger JS automates the "you forgot to..." feedback, saving human reviewers from having to be the nag. This directly reduces the cognitive overhead of checking procedural things.

### GitHub Action setup

```yaml
# .github/workflows/danger.yml
name: Danger JS
on: pull_request

jobs:
  danger:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g danger
      - run: npx danger ci
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Dangerfile.ts

```typescript
// dangerfile.ts
import { danger, warn, fail, message, markdown } from "danger";

const pr = danger.github.pr;
const modified = danger.git.modified_files;
const created = danger.git.created_files;
const allFiles = [...modified, ...created];

// ──────────────────────────────────────────────
// PR SIZE — the single biggest fatigue factor
// ──────────────────────────────────────────────
const additions = pr.additions || 0;
const deletions = pr.deletions || 0;
const totalChanges = additions + deletions;

if (totalChanges > 800) {
  fail(
    `🚨 This PR has ${totalChanges} lines changed. ` +
    `PRs over 800 lines have significantly lower review quality. ` +
    `Consider breaking this into stacked PRs.`
  );
} else if (totalChanges > 400) {
  warn(
    `⚠️ This PR has ${totalChanges} lines changed. ` +
    `Aim for under 400 lines for thorough reviews.`
  );
}

// ──────────────────────────────────────────────
// MISSING TESTS
// ──────────────────────────────────────────────
const hasSrcChanges = allFiles.some(f =>
  f.startsWith("src/") && !f.includes(".test.") && !f.includes(".spec.")
);
const hasTestChanges = allFiles.some(f =>
  f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__")
);

if (hasSrcChanges && !hasTestChanges) {
  warn(
    "This PR changes application code but has no test changes. " +
    "Was this intentional?"
  );
}

// ──────────────────────────────────────────────
// HIGH-RISK FILE CHANGES
// ──────────────────────────────────────────────
const highRiskPatterns = [
  { pattern: /migrations?\//,       label: "database migration" },
  { pattern: /\.env/,               label: "environment config" },
  { pattern: /auth|permission|rbac/i, label: "auth/permissions" },
  { pattern: /docker|k8s|helm/i,    label: "infrastructure" },
  { pattern: /ci|workflow/i,         label: "CI/CD pipeline" },
];

const riskyFiles = allFiles.flatMap(f =>
  highRiskPatterns
    .filter(p => p.pattern.test(f))
    .map(p => `- \`${f}\` (${p.label})`)
);

if (riskyFiles.length > 0) {
  warn(
    `🔍 **High-attention files changed:**\n${riskyFiles.join("\n")}\n\n` +
    `These files affect critical systems — please review carefully.`
  );
}

// ──────────────────────────────────────────────
// PR DESCRIPTION CHECK
// ──────────────────────────────────────────────
if (!pr.body || pr.body.length < 50) {
  warn(
    "PR description is very short. A good description helps reviewers " +
    "understand intent before reading code."
  );
}

// ──────────────────────────────────────────────
// SEMANTIC CHANGE MAP (lightweight version)
// Groups changed files by directory/concern
// ──────────────────────────────────────────────
const filesByArea = new Map<string, string[]>();
for (const f of allFiles) {
  const parts = f.split("/");
  const area = parts.length > 1 ? parts.slice(0, 2).join("/") : parts[0];
  if (!filesByArea.has(area)) filesByArea.set(area, []);
  filesByArea.get(area)!.push(f);
}

let changeMap = "## 🗺️ Change Map\n\n";
changeMap += "| Area | Files | Lines |\n|---|---|---|\n";
for (const [area, files] of filesByArea) {
  changeMap += `| \`${area}\` | ${files.length} | — |\n`;
}
changeMap += `\n*Review in the order that makes sense for the feature, not alphabetically.*`;

markdown(changeMap);
```

This gives every PR an automatic "change map" grouped by area, plus warnings about size, missing tests, and risky files — all before a human even opens the diff.

---

## 4. Reading Progress & Delta Tracking (Reviewable)

Reviewable is the only tool I found that properly tracks *what you've reviewed* at a per-file, per-revision level.

### Setup

Install the Reviewable GitHub App. It overlays GitHub's PR UI. Key fatigue-reducing features:

- **"Mark as reviewed" per file**: Tracks which revision of each file you last reviewed
- **Delta since last look**: When new commits arrive, shows only what changed since you last reviewed — even across rebases
- **File matrix**: Visual grid showing review state of every file × every revision
- **Stale review indicators**: Faded avatars show when a reviewer's mark is outdated
- **Hides fully-reviewed files**: Reduces visual clutter as you progress

### Configuration (via repo settings)

```javascript
// review-completion-condition.js (Reviewable custom condition)
// Require at least one reviewer to have reviewed all files at latest revision
const completed = _.every(review.files, f =>
  _.some(f.reviewers, r => r.revision === f.latestRevision)
);
return { completed };
```

### Limitation

Reviewable tracks at the *file* level, not the *semantic chunk* level. You can't mark "I've reviewed the auth-related changes across these 3 files but not the logging changes in the same files." This is the gap that doesn't yet have a tool.

### Workaround: combine with CodeRabbit's walkthrough

Use the CodeRabbit walkthrough as your reading order. For each logical group it identifies, open and review those specific files in Reviewable, marking each as reviewed. This is manual orchestration, but it's the closest workflow to semantic progress tracking available today.

---

## 5. Communication & Reduced Context Switching (Axolo)

Context switching between Slack, GitHub, and your IDE is a real fatigue multiplier.

### Setup

Install Axolo from the Slack App Directory and connect to GitHub. For each PR:

- Creates a **temporary Slack channel** (e.g., `#pr-1234-add-auth-endpoint`)
- Posts PR summary, CI status, and review requests into the channel
- Syncs GitHub comments ↔ Slack messages bidirectionally
- Archives the channel when the PR is merged

This means reviewers get notified in Slack, can discuss without leaving Slack, and the PR channel disappears when done — no persistent noise.

### Alternative: GitHub + Slack integration (lighter weight)

If Axolo is too heavy, GitHub's native Slack integration can be configured to post to a `#code-review` channel:

```
/github subscribe owner/repo pulls reviews comments
/github unsubscribe owner/repo issues commits
```

---

## 6. Review Metrics & Load Monitoring

### Option A: LinearB (SaaS)

Tracks cycle time, review time, PR pickup time, and can identify when specific reviewers are overloaded. Provides "WorkerB" nudges in Slack when PRs go stale.

### Option B: Lightweight GitHub Action for basic metrics

```yaml
# .github/workflows/review-metrics.yml
name: Review Load Check
on:
  pull_request:
    types: [review_requested]

jobs:
  check-load:
    runs-on: ubuntu-latest
    steps:
      - name: Check reviewer load
        uses: actions/github-script@v7
        with:
          script: |
            const reviewer = context.payload.requested_reviewer?.login;
            if (!reviewer) return;
            
            // Count open PRs where this person is a requested reviewer
            const { data: prs } = await github.rest.pulls.list({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: 'open',
            });
            
            const reviewLoad = prs.filter(pr =>
              pr.requested_reviewers?.some(r => r.login === reviewer)
            ).length;
            
            if (reviewLoad >= 5) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: `⚠️ @${reviewer} currently has ${reviewLoad} open PRs awaiting their review. Consider assigning someone else or waiting.`
              });
            }
```

---

## 7. PR Size Enforcement (Graphite or Danger)

If your team is willing to adopt it, **Graphite CLI** for stacked PRs is the most impactful single change for review fatigue. Each PR in the stack is small, focused, and semantically coherent by design.

If Graphite is too big a workflow change, the Danger JS `fail()` on >800 lines (from section 3) acts as a softer guardrail.

### Graphite quick start

```bash
# Install
npm install -g @withgraphite/graphite-cli

# Create a stack
gt branch create feat/add-auth-model -m "Add user auth model and migration"
# ... make changes, commit ...
gt branch create feat/add-auth-endpoint -m "Add auth API endpoint"
# ... make changes, commit ...
gt branch create feat/add-auth-tests -m "Add auth integration tests"
# ... make changes, commit ...

# Submit entire stack as linked PRs
gt stack submit
```

Each PR is small, logically coherent, and reviewable independently. GitHub shows them as linked PRs with dependency arrows.

---

## Putting It All Together

### Installation order

1. **CodeRabbit** — install GitHub App, add `.coderabbit.yaml` (5 min)
2. **Danger JS** — add workflow + `dangerfile.ts` (15 min)
3. **Difftastic action** — add workflow (10 min)
4. **Reviewable** — install GitHub App (5 min)
5. **Axolo** — install Slack App, connect to GitHub (10 min)
6. **Graphite** — team-wide CLI install + workflow adoption (days, but high impact)

### What a reviewer's experience looks like with this stack

1. Get a **Slack notification** in an ephemeral PR channel (Axolo)
2. Open the PR and see a **structured walkthrough** grouping changes by concern (CodeRabbit)
3. See a **change map** showing which areas of the codebase are touched and a **difftastic summary** flagging which files have semantic vs cosmetic changes (Danger + Difftastic action)
4. See **automated warnings** about PR size, missing tests, and high-risk files (Danger)
5. See **inline AI review comments** on bugs, security issues, and suggestions (CodeRabbit)
6. Open Reviewable and **work through files** in the logical order from the walkthrough, **marking each as reviewed** as you go
7. After new commits, Reviewable shows **only the delta** since your last review

### What's still missing (the build-it-yourself gap)

- **Cross-file semantic chunking**: No tool automatically groups "the handler + route + schema + test for the new auth endpoint" as a single reviewable unit. CodeRabbit's walkthrough approximates this in text form, but there's no GUI that lets you step through chunks.
- **Sub-file reading progress**: Reviewable tracks file-level progress, not "I've reviewed the auth changes in this file but not the logging changes."
- **Test ↔ implementation pairing**: No tool automatically presents a test file *alongside* the implementation it covers in a unified view.
- **Attention heatmap**: No tool highlights which parts of a diff are high-risk (complex logic, security-sensitive) vs low-risk (boilerplate, config) in a visual way.

These gaps represent a genuine product opportunity. The semantic chunking and reading-progress-tracking problem, applied specifically to code review rather than RAG, is an unsolved UX problem.

---

## Implementation Status

### Implemented (code artifacts in this repo)

| Tool | File(s) | Status |
|---|---|---|
| **Danger JS** | `dangerfile.ts`, `.github/workflows/danger.yml` | Ready — runs on PRs via `GITHUB_TOKEN` |
| **Difftastic** | `.github/workflows/difftastic.yml` | Ready — extracts base/head files for comparison |
| **Review Metrics** | `.github/workflows/review-metrics.yml` | Ready — warns when reviewer has 5+ open PRs |
| **CodeRabbit** | `.coderabbit.yaml` | Config ready — requires GitHub App install |
| **AI Review** | `.github/workflows/ai-review.yml` | Claude only — Codex removed (see AI review decisions below) |

### External setup required

| Tool | Action needed |
|---|---|
| **CodeRabbit** | Install GitHub App from marketplace |
| **Reviewable** | Install GitHub App |
| **Axolo** | Install Slack App, connect to GitHub |
| **Graphite** | Team-wide CLI install (`npm i -g @withgraphite/graphite-cli`) |

### AI review decisions

Three AI reviewers (CodeRabbit + Claude + Codex) producing inline comments is noisy. Consolidated to two with distinct roles:

| Reviewer | Role | Why keep |
|---|---|---|
| **Claude** (`claude-code-action`) | Convention enforcement + security | Reads AGENTS.md; strong at logic/security analysis; custom prompt |
| **CodeRabbit** (`.coderabbit.yaml`) | Structured walkthrough + path-scoped review | Only tool that groups changes by logical concern; path instructions teach it the module architecture |
| ~~Codex~~ | ~~General inline review~~ | Removed — overlaps with Claude, less project-specific context, no unique capability |

### Observed gaps after implementation

1. **Difftastic edge cases.** Uses `--exit-code` for clean semantic/cosmetic classification, but: binary files produce exit code 0 (classified as cosmetic), deleted files are skipped entirely, and new files (no base version) are skipped. The classification is a useful signal, not ground truth.

2. **Danger rules are text-matching heuristics.** Can detect missing tests, barrel files, co-located tests, and risky file paths — but cannot enforce semantic conventions like "does `run()` return `runner.execute()` directly?" or "are step functions registered via `runner.step(fn, ...args)`?". Semantic convention enforcement stays with AI reviewers.

3. **No test-implementation pairing.** Tests in `tests/` mirror `stack/` by convention, but no tool presents them side-by-side in review. A reviewer seeing changes to `stack/vault/crypto.ts` must manually navigate to `tests/unit/vault/crypto.test.ts`. Danger's change map groups tests separately, which actually makes this worse — it separates related changes. Not solvable with existing tools.

4. **No sub-file reading progress.** Reviewable tracks file-level progress. No existing tool tracks "I've reviewed the vault changes in this file but not the logging changes." Would require a browser extension or custom review UI tracking scroll position / selected ranges within diffs. Unsolved UX problem — no existing tool.

5. **No cross-file semantic chunking.** Danger's change map groups by module area (Browser, Extension, Framework, etc.) but not by logical concern. A PR adding a new task touches Projects, Tests, and possibly Framework — these appear as separate rows, not as a unified "new task" chunk. CodeRabbit's walkthrough approximates this in text form, but there's no GUI that lets you step through chunks. Would require AI or convention-based grouping — custom development.

6. **No attention heatmap.** No tool highlights which diff regions are high-risk (complex logic, crypto, auth) vs low-risk (config, boilerplate). Partially buildable: a GitHub Action could run complexity analysis + pattern matching on changed hunks. Requires AST parsing — non-trivial.

7. **Review metrics needs a separate service at scale.** The lightweight GitHub Action checks load at review-request time only. Proper review metrics (cycle time, pickup time, queue depth trends, staleness alerts) require a persistent service like LinearB or a custom dashboard with historical data. The Action is a starting point, not a solution.

8. **Sticky comment action supply chain.** `marocchino/sticky-pull-request-comment` is pinned to a SHA but maintained by a solo developer. Consider self-hosting or forking if this becomes critical infrastructure.

9. **CodeRabbit requires paid GitHub App.** The `.coderabbit.yaml` config is ready but inert without the App installed from the marketplace.
