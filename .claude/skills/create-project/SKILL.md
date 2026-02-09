---
description: Create a new project end-to-end including directory, vault setup, task file, and registration. Use when setting up a new site to monitor.
---

# Creating a Project

A project is a goal that may span multiple tasks (e.g., "monitor-acme"). To set up a new project end-to-end:

## 1. Create the project directory

```
stack/projects/acme/
  tasks/
    acme-login.ts    <- task file (see /add-task)
  README.md          <- optional, describe the project goal
```

## 2. Create the vault project

```bash
npm run vault -- login
npm run vault -- project create monitor-acme
```

This outputs a project token. Save it — you'll need it for `.env`.

## 3. Add vault details

```bash
npm run vault -- detail set monitor-acme email
npm run vault -- detail set monitor-acme password
```

Each command prompts for the secret value interactively.

## 4. Write the task file

See `/add-task` for the full pattern. The key fields that tie a task to its project:

```typescript
export const acmeLoginTask: RetryingTask = {
  name: "acmeLogin",
  url: "https://acme.example.com/login",
  project: "monitor-acme",        // must match vault project name
  needs: { email: "email", password: "password" },  // local key -> vault detail key
  mode: "retry",
  intervalMs: 300_000,
  contextSchema,
  run,
};
```

## 5. Register the task

In `stack/framework/registry.ts`:

```typescript
import { acmeLoginTask } from "../projects/acme/tasks/acme-login.js";

export const allTasks: TaskConfig[] = [botcLoginTask, acmeLoginTask];
```

## 6. Set up `.env`

Export the project token and add it to `.env`:

```bash
npm run vault -- project export monitor-acme
```

```env
VAULT_TOKEN=<token from export>
```

## Running

```bash
npm run check acmeLogin          # Docker
npm run dev -- acmeLogin          # Local (after npm run build)
```

## Multiple tasks per project

A project can have multiple tasks sharing the same vault credentials:

```
stack/projects/acme/
  tasks/
    acme-login.ts      <- RetryingTask, monitors login
    acme-status.ts     <- SingleAttemptTask, checks status page
```

Both declare `project: "monitor-acme"` and share the same `VAULT_TOKEN`. Register each task separately in the registry.
