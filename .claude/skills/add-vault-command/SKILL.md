---
description: Add a new vault CLI command (e.g., audit, export). Use when extending the vault's command-line interface.
---

# Adding a Vault CLI Command

To add a new CLI command (e.g., `vault audit`), touch 2–3 files:

## 1. Create the command handler

If it fits an existing group (`detail`, `project`, `session`), add to that file. Otherwise create a new file in `stack/vault/cli/commands/`.

A command handler receives `args: string[]` and either succeeds or throws:

```typescript
// stack/vault/cli/commands/audit.ts
import { openVault } from "../../core.js";
import { requireMasterKey } from "../auth.js";
import { VAULT_PATH } from "../env.js";

async function handleAudit(args: string[]): Promise<void> {
  const subcommand = args[0];
  if (!subcommand) {
    console.error("Usage: vault audit <subcommand>");
    process.exit(1);
  }

  // Most commands need the master key (via session or password prompt)
  const db = openVault(VAULT_PATH);
  try {
    const masterKey = await requireMasterKey(db);
    // implementation...
  } finally {
    db.close();
  }
}

export { handleAudit };
```

### Auth patterns

- **`requireMasterKey(db)`** — gets master key from active session or prompts for password. Use for most commands.
- **No auth needed** — commands like `status` that only check session state. Use `openVault()` directly.

## 2. Register in `stack/vault/cli/main.ts`

Add the import and switch case:

```typescript
import { handleAudit } from "./commands/audit.js";

// In the switch:
case "audit":
  await handleAudit(commandArgs);
  break;
```

Update the `usage()` help text to include the new command.

## 3. Add vault operation (if needed)

If the command needs new database logic, add it to `stack/vault/ops/`. See the existing files:

- `projects.ts` — CRUD for projects and key rotation
- `details.ts` — CRUD for encrypted details
- `sessions.ts` — session lifecycle
- `runtime.ts` — detail loading for tasks (project-key path)

Operations are pure functions that take `(db, masterKey, ...args)`. Keep crypto logic in `ops/`, keep CLI concerns (prompts, output, exit codes) in `cli/commands/`.

## Running

```bash
npm run vault -- audit <args>
```

CLI tests run against `dist/` — always `npm run validate` before testing.
