# Installed Claude Code Plugins

All plugins from the **anthropics/claude-plugins-official** marketplace.
Installed: 2026-02-20 | Git SHA: `8deab846`

| Plugin | Description | Skills / Commands |
|--------|-------------|-------------------|
| **code-simplifier** | Simplifies and refines code for clarity, consistency, and maintainability while preserving functionality | Subagent: `code-simplifier` |
| **typescript-lsp** | TypeScript/JavaScript language server providing go-to-definition, find references, and error checking | — |
| **code-review** | Automated code review for pull requests using specialized agents with confidence-based scoring | `/code-review` |
| **commit-commands** | Streamline git workflow with commands for committing, pushing, and creating PRs | `/commit`, `/commit-push-pr`, `/clean_gone` |
| **hookify** | Create hooks to prevent unwanted behaviors by analyzing conversation patterns | `/hookify`, `/hookify list`, `/hookify configure`, `/hookify help`, `/hookify writing-rules` |
| **security-guidance** | Security reminder hook that warns about potential issues (command injection, XSS, unsafe patterns) when editing files | Hook (automatic) |
| **context7** | Upstash Context7 MCP server for pulling version-specific docs and code examples from source repos | MCP tools: `resolve-library-id`, `query-docs` |
| **github** | Official GitHub MCP server for repo management, issues, PRs, code review, and search | MCP tools |
| **claude-md-management** | Audit quality, capture session learnings, and keep CLAUDE.md project memory current | `/revise-claude-md`, `/claude-md-improver` |
| **pr-review-toolkit** | Comprehensive PR review with specialized agents for comments, tests, error handling, type design, and code quality | `/review-pr`, subagents: `code-reviewer`, `silent-failure-hunter`, `code-simplifier`, `comment-analyzer`, `pr-test-analyzer`, `type-design-analyzer` |
| **feature-dev** | Feature development workflow with agents for codebase exploration, architecture design, and quality review | `/feature-dev`, subagents: `code-reviewer`, `code-explorer`, `code-architect` |
| **ralph-loop** | Continuous self-referential AI loops for iterative development (Ralph Wiggum technique) | `/ralph-loop`, `/cancel-ralph`, `/ralph-loop help` |
| **claude-code-setup** | Analyze codebases and recommend tailored Claude Code automations (hooks, skills, MCP servers, subagents) | `/claude-automation-recommender` |
| **skill-creator** | Create, improve, and benchmark skills with eval support and variance analysis | `/skill-creator` |

**Total: 14 plugins**
