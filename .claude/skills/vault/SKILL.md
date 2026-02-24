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

See `stack/vault/README.md § CLI` for the full command reference (init, login/logout, detail CRUD, project CRUD, password management).

### Vault vs environment variables

| Use vault for | Use env vars for |
|--------------|-----------------|
| Credentials, passwords, API keys | Ports, display numbers |
| Anything secret | Feature flags, retry intervals |
| Per-project config | Infrastructure config |

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

Key rotation re-encrypts all DEKs under a new project key. **The old token immediately stops working.**

```bash
npm run vault -- login
npm run vault -- project rotate <project-name>
npm run vault -- project export <project-name>   # get new token
```

After rotation: update `.env` with the new `VAULT_TOKEN_*` value and restart running containers.

Internally, `rotateProject()` in `stack/vault/ops/projects.ts` runs in a SAVEPOINT — on any failure, the entire operation rolls back. See `stack/vault/README.md § Security Properties` for the full encryption model.