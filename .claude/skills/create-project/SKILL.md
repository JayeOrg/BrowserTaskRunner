---
description: Create a new project end-to-end including directory, vault setup, task file, and registration. Use when setting up a new site to monitor.
---

# Creating a Project

A project is a goal that may span multiple tasks (e.g., "monitor-acme"). To set up a new project end-to-end:

## 1. Create the project directory

```
stack/projects/acme/
  tasks/
    acmeLogin.ts     <- task file, named after the task (see /add-task)
  README.md          <- optional, describe the project goal
```

## 2. Create the vault project

```bash
npm run vault -- login
npm run vault -- project create monitor-acme
```

This outputs a project token. Save it — you'll need it for `.env`.

## 3. Add vault details

After writing the task file (step 4), use `project setup` to interactively add all missing details from the task's `needs`. This requires a build first so the loader can discover needs:

```bash
npm run build
npm run vault -- project setup monitor-acme
```

This will show which details are present/missing and prompt for each missing value.

Alternatively, add details individually:

```bash
npm run vault -- detail set monitor-acme email
npm run vault -- detail set monitor-acme password
```

Verify with:

```bash
echo '<vault-password>' | npm run vault -- detail list monitor-acme
```

## 4. Write the task file

See `/add-task` for the full pattern. Name the file `{taskName}.ts` (e.g., `acmeLogin.ts`) and export `const task`:

```typescript
// File: stack/projects/acme/tasks/acmeLogin.ts
export const task: RetryingTask = {
  name: "acmeLogin",              // must match filename
  displayUrl: "https://acme.example.com/login",
  project: "monitor-acme",        // must match vault project name
  needs: needsFromSchema(secretsSchema),
  mode: "retry",
  intervalMs: 300_000,
  secretsSchema,
  run,
};
```

Use `needsFromSchema(secretsSchema)` when vault keys match schema keys. If the vault detail names differ from the local secrets keys, use an explicit mapping:

```typescript
needs: { loginEmail: "email", loginPassword: "password" },
```

No registration step needed — the loader discovers tasks by filename convention.

## 5. Set up `.env`

Add the project token to `.env` using the per-project naming convention:

```bash
npm run vault -- project export monitor-acme
```

```env
VAULT_TOKEN_MONITOR_ACME=<token from export>
```

## Running

```bash
npm run check acmeLogin
```

## Multiple tasks per project

A project can have multiple tasks sharing the same vault credentials:

```
stack/projects/acme/
  tasks/
    acme-login.ts      <- RetryingTask, monitors login
    acme-status.ts     <- SingleAttemptTask, checks status page
```

Both declare `project: "monitor-acme"` and share the same `VAULT_TOKEN`. The loader discovers tasks by filename — no registration needed.
