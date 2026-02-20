---
description: Add a vault CLI command, manage project secrets, or rotate a project key. Use for changes to stack/vault/.
---

# Vault Operations

## Managing Secrets

Vault details are encrypted secrets scoped to a project. Tasks access them via the `needs` mapping.

### Authentication

All mutating commands require the vault master password:

1. **Session token** — `VAULT_ADMIN` in `.env`. Created by `npm run vault -- login`. Commands auto-use it when present.
2. **Password prompt** — when no session exists. In a TTY, prompts interactively. When piped, reads the first stdin line as password.

### Adding a secret from Claude Code

Since Claude Code runs non-interactively, pipe the vault password and secret value as two lines on stdin:

```bash
printf 'vault-password\nsecret-value' | npm run vault -- detail set <project> <key>
```

The CLI reads line 1 as the master password and line 2 as the secret value. Both use the shared `readStdinLine` buffer — all piped lines are buffered on first read, then consumed sequentially.

If a `VAULT_ADMIN` session token is active, only the secret value is needed:

```bash
printf 'secret-value' | npm run vault -- detail set <project> <key>
```

**Important**: The user must provide both the vault password and the secret value. Never guess or fabricate these.

### Wiring into a task

Every task declares `needs` — a mapping from local secrets keys to vault detail names. Use `needsFromSchema` when keys match 1:1. See the `/task` skill for the full pattern.

### CRUD commands

```bash
npm run vault -- detail set <project> <key>      # create or update
npm run vault -- detail get <project> <key>      # read (prints to stdout)
npm run vault -- detail list [project]           # list keys (no values)
npm run vault -- detail remove <project> <key>   # delete
```

`detail set` uses `ON CONFLICT ... DO UPDATE` — setting the same project/key pair overwrites the value with a new DEK.

### Vault vs environment variables

| Use vault for | Use env vars for |
|--------------|-----------------|
| Credentials, passwords, API keys | Ports, display numbers |
| Anything secret | Feature flags, retry intervals |
| Per-project config | Infrastructure config |

### Encryption model

Each detail gets its own random DEK (data encryption key). The DEK wraps the value, and is itself wrapped under both the **master key** (for admin operations) and the **project key** (for runtime access). This dual wrapping lets tasks decrypt only their own project's secrets.

```
Master Key (from password) → wraps → Project Key (per-project, 32 bytes) → wraps → DEK (per-detail, 32 bytes) → encrypts → Secret value (AES-256-GCM)
```

---

## Adding a CLI Command

To add a new CLI command (e.g., `vault audit`), touch 2-3 files:

### 1. Create the command handler

If it fits an existing group (`detail`, `project`, `session`), add to that file. Otherwise create `stack/vault/cli/commands/<name>.ts`:

```typescript
import { openVault } from "../../core.js";
import { requireMasterKey } from "../auth.js";
import { VAULT_PATH } from "../env.js";

async function handleAudit(args: string[]): Promise<void> {
  const subcommand = args[0];
  if (!subcommand) {
    console.error("Usage: vault audit <subcommand>");
    process.exit(1);
  }

  const db = openVault(VAULT_PATH);
  try {
    const masterKey = await requireMasterKey(db);
    // Implementation...
  } finally {
    db.close();
  }
}

export { handleAudit };
```

**Auth patterns:** `requireMasterKey(db)` for most commands. No auth needed for status-type commands — use `openVault()` directly.

### 2. Register in `stack/vault/cli/main.ts`

Add import, switch case, and update `usage()` help text.

### 3. Add vault operation (if needed)

If new database logic is needed, add to `stack/vault/ops/`. Existing files: `projects.ts` (CRUD + rotation), `details.ts` (CRUD for encrypted details), `sessions.ts` (session lifecycle), `runtime.ts` (detail loading for tasks).

Operations are pure functions: `(db, masterKey, ...args)`. Keep crypto in `ops/`, CLI concerns (prompts, output, exit codes) in `cli/commands/`.

CLI tests run against `dist/` — always `npm run validate` before testing.

---

## Rotating a Project Key

Key rotation re-encrypts all DEKs under a new project key without touching actual secret values.

### Quick rotation

```bash
npm run vault -- login
npm run vault -- project rotate <project-name>
```

Outputs a new project token. **The old token immediately stops working.**

### What happens internally

`rotateProject()` in `stack/vault/ops/projects.ts`:

1. Opens a SAVEPOINT (atomic transaction)
2. Decrypts old project key using master key
3. Generates new random 32-byte project key
4. Re-encrypts every detail's DEK under the new project key
5. Releases SAVEPOINT (commits)

On any failure, the entire operation rolls back.

### After rotation

1. Export new token: `npm run vault -- project export <project-name>`
2. Update `.env` with the new `VAULT_TOKEN_*` value
3. Restart any running containers (they cache the token at startup)

### When to rotate

- Project token may have been exposed
- Team member with access leaves
- Periodic rotation policy
- After a security incident