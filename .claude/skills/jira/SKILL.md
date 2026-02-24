---
description: View the Jira ticket for the current branch, pull specs for feature work, or enrich a PR with ticket context. Use for anything Jira-related.
---

# Jira

Two modes: **view** (default) and **PR enrichment**.

## Branch Convention

Feature branches use `TICKET-KEY/description` format (e.g. `JORG-123/add-login-flow`). The ticket key is extracted automatically.

## View Mode

Display the Jira ticket linked to the current branch.

### Process

1. Get the current branch:
   ```bash
   git branch --show-current
   ```

2. Extract the ticket key — match `[A-Z]+-\d+` from the branch name. If no match, tell the user no ticket key was found and stop.

3. Fetch the ticket using the Jira MCP server's issue retrieval tool. Request the `summary` and `description` fields.

4. Display in chat:
   ```
   **JORG-123**: <summary>
   https://jayemcc.atlassian.net/browse/JORG-123

   <description, cleaned up for readability>
   ```

## PR Enrichment

When creating a PR (via `/commit` or manually), detect and use Jira context.

### Process

1. Extract the ticket key from the current branch (same as view mode).

2. If a ticket key is found, fetch summary and description via Jira MCP.

3. Format the PR:
   - **Title**: `JORG-123: <ticket summary>`
   - **Body "Why" section**: Include the Jira link and a one-line summary from the ticket description.

   Example:
   ```
   ## Why

   [JORG-123](https://jayemcc.atlassian.net/browse/JORG-123): <ticket summary>
   ```

4. If no ticket key is found, proceed without Jira context (no error).

## Jira Instance

- URL: `https://jayemcc.atlassian.net`
- Project: `JORG`
- Browse link pattern: `https://jayemcc.atlassian.net/browse/<TICKET-KEY>`
