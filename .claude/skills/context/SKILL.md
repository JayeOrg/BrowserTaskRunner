---
description: Audit context efficiency, check for duplication, or condense documentation. Use for recurring context hygiene reviews.
---

# Context Audit

Three review modes: inventory, duplication check, and condensing. Run all three for a full audit, or pick one.

## Inventory

Measure what loads and when. Produces a table of all context files with their cost and loading behavior.

### Process

1. **Enumerate all context files**: Glob for these patterns:
   - `CLAUDE.md`, `AGENTS.md` (root)
   - `.claude/rules/**/*.md`
   - `.claude/skills/*/SKILL.md`
   - `docs/**/*.md`
   - `stack/*/README.md`

2. **Measure each file**: Line count and estimated token cost (~3.5 tokens per line of markdown).

3. **Classify loading behavior**:

   | Category | Files | When loaded |
   |----------|-------|-------------|
   | Always | `CLAUDE.md`, `AGENTS.md` | Every conversation |
   | Path-scoped | `.claude/rules/**/*.md` | When working with files matching `paths:` frontmatter |
   | On-demand | Skills | When invoked via `/command` |
   | Manual | `docs/`, READMEs | When explicitly read or referenced by a pointer |

4. **Flag outliers**: Files over these thresholds:
   - Always-loaded: >100 lines
   - Skills: >250 lines
   - Any single file: >300 lines

5. **Report**: Output a summary table in chat.

---

## Duplication Check

Find redundant content across context layers.

### Process

1. **Read all always-loaded and path-scoped files** (AGENTS.md, `.claude/rules/`, `docs/`).

2. **Read all on-demand files** (skills, agents).

3. **Cross-check for overlap**: For each section in AGENTS.md, check whether the same rules appear in:
   - A skill's SKILL.md
   - A docs file
   - A README

4. **Check pointer validity**: For each `.claude/rules/` file, verify the referenced docs file exists.

5. **Check reference validity**: Grep for references to `AGENTS.md`, `docs/`, and skill paths across the codebase. Flag any that point to moved or deleted files.

6. **Classify findings**:
   - **Duplicated**: Same content in always-loaded AND on-demand — remove from always-loaded
   - **Misscoped**: Universal content that only applies to one stack area — move to path-scoped
   - **Stale reference**: Pointer to a file that doesn't exist or was renamed
   - **Valid**: Intentional duplication (e.g. cross-cutting rules repeated for different audiences)

7. **Report**: Output findings table in chat. **Wait for user approval before applying.**

---

## Condensing

Tighten verbose content and apply structural improvements.

### Process

1. **Run Inventory and Duplication Check first** (if not already done this session).

2. **Review each flagged file** for:
   - Verbose phrasing that can be shortened without losing meaning
   - Examples that duplicate what's already in referenced code
   - Sections that restate what the code already makes obvious
   - Content that belongs in a different layer (e.g. always-loaded → skill)

3. **Propose edits**: For each proposed change, state:
   - File and section
   - What changes and why
   - Estimated line savings

4. **Present**: Output proposals in chat. **Wait for user approval.**

5. **Apply**: Make approved edits. Update cross-references if content moved.

6. **Re-run Inventory**: Confirm line counts and token estimates improved.

### Learnings

- Reviewer Checklist was fully duplicated between AGENTS.md and a dedicated agent file (since removed) — removed from always-loaded
- Vault-specific notes (node:sqlite, defense-in-depth) were in the universal Architecture section — moved to `docs/stack/vault.md`
- Extension Design Principle and Task Design were in the always-loaded AGENTS.md but only apply to their respective stacks — moved to `docs/stack/`
- Skills that reference AGENTS.md sections need updating when content moves to docs/
- `REJECTED.md` (190 lines, flat bullets) split into 6 scoped sub-files under `docs/rejected/` with `.claude/rules/rejected/` pointers — `docs/REJECTED.md` keeps only cross-cutting entries and Failed Approaches
- Vault SKILL.md had CRUD commands duplicating README — replaced with reference to `stack/vault/README.md § CLI`
- Task SKILL.md had inline code examples duplicating source — replaced with brief descriptions + source file refs
- Sub-agent file reads can hallucinate content (e.g. reporting 73 lines for a 4-line file) — always verify with direct reads
