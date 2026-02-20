# Vault

Local secrets service with project-scoped access control. Stores encrypted credentials in SQLite with a three-layer key hierarchy.

## Key Hierarchy

```
Master password (interactive prompt, or piped to stdin)
  → scrypt → masterKey
      → encrypts project encryption keys (projects table)
      → wraps DEKs for admin access (details table, master_wrapped_dek)

Project key (random, per project)
  → exportable as base64 token (VAULT_TOKEN_<PROJECT>)
  → wraps DEKs for runtime access (details table, project_wrapped_dek)

DEK (random, per detail)
  → encrypts the actual secret value
```

Each detail value is encrypted with its own random DEK. The DEK is wrapped twice in the same row: once with the master key (for admin CLI) and once with the owning project's key (for runtime). Details belong directly to a project — no separate grant step needed.

## Two Modes of Operation

**Admin** (CLI): prompted for password interactively, or use `vault login` to start a time-limited session that writes an admin token to `.env`. Subsequent commands pick up the token automatically — no re-entering the password. In non-interactive contexts (CI, scripts), pipe the password to stdin.

**Runtime** (tasks, requires `VAULT_TOKEN_<PROJECT>`): project key unwraps DEKs from the project's own details. Master password not needed. A compromised token exposes only that project's details.

## Storage

SQLite database (`vault.db` at project root). Tables:

| Table | Purpose | Encrypted columns |
|-------|---------|-------------------|
| `config` | Global salt + password verification | `ciphertext` (password check) |
| `projects` | Project encryption keys wrapped with master key | `key_ciphertext` |
| `details` | Secret values + DEK wrapped with both master and project key | `ciphertext`, `master_dek_ciphertext`, `project_dek_ciphertext` |
| `sessions` | Time-limited admin sessions, master key encrypted with session key | `ciphertext` |

Details have a composite primary key `(project, key)` — the same detail name can exist in different projects. All CLI commands require authentication (password or admin session). Only secret values and encryption keys are encrypted; metadata (detail names, project names) is stored in plaintext columns.

## CLI

Admin commands prompt for the vault password interactively, unless an admin session is active. For scripting, pipe the password to stdin (e.g., `echo "$PW" | npm run vault -- ...`).

```bash
# Initialize
npm run vault -- init

# Admin sessions
npm run vault -- login                       # start 30-min session, writes token to .env
npm run vault -- login --duration 60         # custom duration in minutes
npm run vault -- logout                      # end session, remove token from .env
npm run vault -- status                      # show current session status

# Details (scoped to a project)
npm run vault -- detail set <project> <key>         # prompts for value
npm run vault -- detail get <project> <key>
npm run vault -- detail list [<project>]
npm run vault -- detail remove <project> <key>

# Projects
npm run vault -- project create <name>       # outputs token
npm run vault -- project export <name>       # re-export token
npm run vault -- project list
npm run vault -- project remove <name>       # cascades details
npm run vault -- project rotate <name>       # new key, re-wraps all DEKs
npm run vault -- project rename <old> <new>  # rename project, preserves details
npm run vault -- project setup <name>        # check + prompt for missing details

# Password management
npm run vault -- change-password             # prompts for old + new + confirm
```

## Task Integration

Tasks declare which project they belong to and which details they need:

```typescript
export const myTask: RetryingTask = {
  name: "myTask",
  url: "https://example.com",
  project: "my-project",
  needs: { email: "email", password: "password" },
  // ...
};
```

`needs` maps local context names to detail names within the project. At runtime, the framework:

1. Reads `VAULT_TOKEN_<PROJECT>` (base64 project encryption key, falls back to `VAULT_TOKEN`)
2. Queries details for the task's project + needed detail names
3. Unwraps each DEK with the project key
4. Decrypts each value with its DEK
5. Passes `{ email: "decrypted", password: "decrypted" }` to `run()`

## Setup Example

```bash
# One-time setup
npm run vault -- init
npm run vault -- login                       # enter password once
npm run vault -- project create my-project   # no password prompt
npm run vault -- detail set my-project email        # prompts for value
npm run vault -- detail set my-project password     # prompts for value
npm run vault -- logout

# Add project token to .env (use per-project naming)
# VAULT_TOKEN_MY_PROJECT=<token from project create>

# Run a task
npm run check myTask
```

### Guided Setup with `project setup`

`project setup <name>` scans built task files for a project's declared `needs`, shows which details are already present and which are missing, then interactively prompts for each missing value:

```bash
npm run vault -- login
npm run vault -- project setup my-project
# Project "my-project" needs: email, password
#   email ✓
#   password ✗
# Enter value for "password": ****
npm run vault -- logout
```

## Security Properties

- **Project isolation**: a project token can only decrypt details belonging to that project
- **Wrong token detection**: AES-256-GCM auth tag mismatch fails immediately
- **Token rotation**: `project rotate` generates a new key and re-wraps all detail DEKs; old tokens stop working
- **Cascade deletes**: removing a project automatically removes its details
- **No secrets in shell history**: passwords and detail values are prompted interactively; never passed as CLI args
- **Time-limited admin sessions**: `vault login` creates a session token valid for a configurable duration; token is stored in `.env` (gitignored) and auto-detected by subsequent commands

## Crypto

All encryption uses AES-256-GCM via `node:crypto`. Key derivation uses scrypt (cost=131072, blockSize=8, parallelization=1). No external crypto dependencies.

## Files

```
stack/vault/
├── core.ts              DB init, master key, password change
├── crypto.ts            AES-256-GCM, scrypt, token serialization
├── db.ts                SQLite helpers (withSavepoint)
├── rows.ts              SQLite row type extractors
├── schema.ts            SQL DDL
├── ops/
│   ├── details.ts       Detail CRUD (admin, master key)
│   ├── projects.ts      Project CRUD (admin, master key)
│   ├── runtime.ts       Load secrets (project token, no master key)
│   └── sessions.ts      Admin session lifecycle
└── cli/
    ├── main.ts          Entry point, usage, command dispatch
    ├── auth.ts          Smart auth (session token → password fallback)
    ├── env.ts           VAULT_PATH, .env read/write
    ├── prompt.ts        stdin/terminal input helpers
    └── commands/
        ├── detail.ts    detail set/get/list/remove handlers
        ├── project.ts   project create/export/list/remove/rotate handlers
        └── session.ts   init/login/logout/status/change-password handlers
```
