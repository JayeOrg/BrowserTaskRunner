# Vault

Local secrets service with project-scoped access control. Stores encrypted credentials in SQLite with a three-layer key hierarchy.

## Key Hierarchy

```
Master password (interactive prompt, or piped to stdin)
  → scrypt → masterKey
      → encrypts project keys (projects table)
      → wraps DEKs for admin access (details table, master_wrapped_dek)

Project key (random, per project)
  → exportable as base64 token (VAULT_TOKEN)
  → wraps DEKs for runtime access (details table, project_wrapped_dek)

DEK (random, per detail)
  → encrypts the actual secret value
```

Each detail value is encrypted with its own random DEK. The DEK is wrapped twice in the same row: once with the master key (for admin CLI) and once with the owning project's key (for runtime). Details belong directly to a project — no separate grant step needed.

## Two Modes of Operation

**Admin** (CLI): prompted for password interactively, or use `vault login` to start a time-limited session that writes an admin token to `.env`. Subsequent commands pick up the token automatically — no re-entering the password. In non-interactive contexts (CI, scripts), pipe the password to stdin.

**Runtime** (tasks, requires `VAULT_TOKEN`): project key unwraps DEKs from the project's own details. Master password not needed. A compromised token exposes only that project's details.

## Storage

SQLite database (`vault.db` at project root). Three tables:

| Table | Purpose | Encrypted columns |
|-------|---------|-------------------|
| `config` | Global salt + password verification blob | password check value |
| `projects` | Project keys encrypted with master key | `encrypted_key` |
| `details` | Secret values + DEK wrapped with both master and project key | `ciphertext`, `master_wrapped_dek`, `project_wrapped_dek` |
| `sessions` | Time-limited admin sessions, master key encrypted with session key | `encrypted_master_key` |

Details have a composite primary key `(project, key)` — the same key name can exist in different projects. Metadata (detail keys, project names) is visible without the password. Only values and keys are encrypted.

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

`needs` maps local context keys to detail keys within the project. At runtime, the framework:

1. Reads `VAULT_TOKEN` (base64 project key)
2. Queries details for the task's project + needed keys
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

# Add project token to .env (from project create output)
echo "VAULT_TOKEN=<token>" >> .env

# Run a task
npm run dev -- myTask
```

## Security Properties

- **Project isolation**: a project token can only decrypt details belonging to that project
- **Wrong token detection**: AES-256-GCM auth tag mismatch fails immediately
- **Token rotation**: `project rotate` generates a new key and re-wraps all detail DEKs; old tokens stop working
- **Cascade deletes**: removing a project automatically removes its details
- **No secrets in shell history**: passwords and detail values are prompted interactively; never passed as CLI args
- **Time-limited admin sessions**: `vault login` creates a session token valid for a configurable duration; token is stored in `.env` (gitignored) and auto-detected by subsequent commands

## Crypto

All encryption uses AES-256-GCM via `node:crypto`. Key derivation uses scrypt (cost=16384, blockSize=8, parallelization=1). No external crypto dependencies.

## Files

- `vault.ts` — core library (crypto, database, all operations)
- `vault-manage.ts` — CLI entry point
