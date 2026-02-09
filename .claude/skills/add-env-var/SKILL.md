---
description: Add a new environment variable threaded through Docker. Use when infrastructure config needs to reach the running task container.
---

# Adding an Environment Variable

To thread a new env var (e.g., `ALERT_WEBHOOK`) from host to running task, touch 2–3 files:

## 1. Add to `stack/infra/docker-compose.yml`

Add the variable to the `environment` section with an optional default:

```yaml
environment:
  - TASK_NAME
  - VAULT_TOKEN
  # ...existing...
  - ALERT_WEBHOOK=${ALERT_WEBHOOK:-}
```

Use `${VAR:-}` for optional vars (empty default), `${VAR:-value}` for vars with defaults, or just `VAR` to require it from the host.

## 2. Add to `stack/infra/run.sh` (if Chrome or Xvfb needs it)

Most env vars are for the Node.js process and don't need run.sh changes. Only add here if Chrome flags, display settings, or startup behavior depend on it.

## 3. Read in application code

Env vars are available via `process.env` in the Node.js process. Read them where they're used:

```typescript
// In framework — e.g., stack/framework/run.ts
const alertWebhook = process.env.ALERT_WEBHOOK;
```

For task-level configuration, prefer vault context (`needs` mapping) over env vars. Env vars are for infrastructure concerns (ports, feature flags, intervals).

## Existing env vars

| Variable | Default | Purpose |
|----------|---------|---------|
| `TASK_NAME` | required | Which task to run |
| `VAULT_TOKEN` | required | Project token for secret loading |
| `SITE_CHECK_INTERVAL_MS` | `300000` | Override retry interval |
| `ENABLE_VNC` | `true` | Start VNC server for debugging |
| `DISPLAY_NUM` | `99` | Xvfb display number |
| `WS_PORT` | `8765` | WebSocket server port |
| `DOCKER` | `true` | Set by compose, signals container env |

## When to use env vars vs vault

- **Env vars**: infrastructure config, ports, feature flags, non-secret settings
- **Vault details**: credentials, API keys, anything secret
