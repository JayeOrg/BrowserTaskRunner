---
description: Add a secret to a vault project (credentials, API keys). Use when a task needs a new secret value, or when managing existing secrets.
---

# Adding a Vault Detail

Vault details are encrypted secrets scoped to a project. Tasks access them via the `needs` mapping.

## Authentication

All mutating commands require the vault master password. Two auth methods:

1. **Session token** — `VAULT_ADMIN` in `.env`. Created by `npm run vault -- login`. Commands auto-use it when present.
2. **Password prompt** — when no session exists. In a TTY, prompts interactively. When piped, reads the first stdin line as password.

## Adding a secret from Claude Code

Since Claude Code runs non-interactively (no TTY), pipe the vault password and secret value as two lines on stdin:

```bash
printf 'vault-password\nsecret-value' | npm run vault -- detail set <project> <key>
```

The CLI reads line 1 as the master password (via `getPassword`) and line 2 as the secret value (via `getSecretValue`). Both use the shared `readStdinLine` buffer — all piped lines are buffered on first read, then consumed sequentially.

If a `VAULT_ADMIN` session token is active in `.env`, only the secret value is needed on stdin (password is skipped):

```bash
printf 'secret-value' | npm run vault -- detail set <project> <key>
```

**Important**: The user must provide you with both the vault password and the secret value. Never guess or fabricate these.

## Wiring into a task

Every task declares `needs` explicitly — a mapping from local context keys to vault detail names. Use `needsFromSchema` when keys match 1:1:

```typescript
import { needsFromSchema } from "../../../framework/tasks.js";

const contextSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  apiKey: z.string().min(1),
});

export const myTask: RetryingTask = {
  name: "myTask",
  project: "my-project",
  needs: needsFromSchema(contextSchema),
  // Produces: { email: "email", password: "password", apiKey: "apiKey" }
  contextSchema,
  // ...
};

// When local keys differ from vault detail names, use an explicit mapping:
needs: { loginEmail: "email", loginPassword: "password", key: "api-key" },
```

At runtime, the framework loads each vault key and passes them as `context`:

```typescript
async function run(browser: BrowserAPI, context: TaskContext, deps: StepRunnerDeps): Promise<TaskResultSuccess> {
  const { email, password, apiKey } = context;
  // ...
}
```

## Managing secrets

```bash
npm run vault -- detail set <project> <key>      # create or update
npm run vault -- detail get <project> <key>      # read (prints to stdout)
npm run vault -- detail list [project]           # list keys (no values)
npm run vault -- detail remove <project> <key>   # delete
```

All commands require authentication.

## Updating a secret

`detail set` uses `ON CONFLICT ... DO UPDATE` — setting the same project/key pair overwrites the value. A new DEK is generated each time.

## Context validation

Tasks can validate secrets at startup with an optional `contextSchema`:

```typescript
import { z } from "zod";

const contextSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  apiKey: z.string().min(1),
});
```

The runner calls `contextSchema.safeParse(context)` before `run()` and fails fast if validation fails.

## Vault vs environment variables

| Use vault details for | Use env vars for |
|----------------------|-----------------|
| Credentials, passwords | Ports, display numbers |
| API keys, tokens | Feature flags |
| Anything secret | Retry intervals |
| Per-project config | Infrastructure config |

Vault details are encrypted at rest with AES-256-GCM and scoped per project. Env vars are plaintext and shared across all tasks.

## How encryption works

Each detail gets its own random DEK (data encryption key). The DEK wraps the value, and is itself wrapped under both:
- **Master key** — for admin operations (password change, migration)
- **Project key** — for runtime access (task execution)

This dual wrapping lets tasks decrypt only their own project's secrets using the project token.
