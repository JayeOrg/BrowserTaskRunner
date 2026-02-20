---
description: Add an env var, Docker service, or alert channel. Use for infrastructure changes in stack/infra/.
---

# Infrastructure

## Environment Variables

To thread a new env var (e.g., `ALERT_WEBHOOK`) from host to running task, touch 2-3 files:

### 1. Add to `stack/infra/docker-compose.yml`

```yaml
environment:
  - ALERT_WEBHOOK=${ALERT_WEBHOOK:-}
```

Use `${VAR:-}` for optional, `${VAR:-value}` for defaults, or just `VAR` to require it.

### 2. Add to `stack/infra/run.ts` (only if Chrome or Xvfb needs it)

Most env vars are for the Node.js process and don't need run.ts changes.

### 3. Read in application code

```typescript
const alertWebhook = process.env.ALERT_WEBHOOK;
```

For task-level config, prefer vault context (`needs` mapping) over env vars.

### Existing env vars

| Variable | Default | Purpose |
|----------|---------|---------|
| `TASK_NAME` | required | Which task to run |
| `VAULT_TOKEN` | required | Project token for secret loading |
| `SITE_CHECK_INTERVAL_MS` | `300000` | Override retry interval |
| `ENABLE_VNC` | `true` | Start VNC server |
| `DISPLAY_NUM` | `99` | Xvfb display number |
| `WS_PORT` | `8765` | WebSocket server port |
| `DOCKER` | `true` | Set by compose, signals container env |

### Env vars vs vault

- **Env vars**: infrastructure config, ports, feature flags, non-secret settings
- **Vault**: credentials, API keys, anything secret

---

## Docker Services

The Docker setup lives in `stack/infra/`. To add a new service:

### 1. Add to `stack/infra/docker-compose.yml`

```yaml
services:
  proxy:
    image: some-proxy:latest
    ports:
      - "8080:8080"
    environment:
      - PROXY_TARGET=http://sitecheck:8765
    networks:
      - default
    restart: on-failure
```

Services on the default network reference each other by name. Map `HOST_UID`/`HOST_GID` if writing to shared volumes.

### 2. Add shared volumes (if needed)

Existing patterns:
- `./logs:/app/logs` — host-mounted logs
- `./vault.db:/app/vault.db:ro` — read-only database
- `tmpfs: /tmp/chrome-profile` — ephemeral Chrome data

### 3. Update `stack/infra/check.ts` (if service needs task-specific config)

Set env vars in `process.env` before spawning docker compose.

### 4. Update `stack/infra/run.ts` (if sitecheck needs to wait for the service)

Add a readiness check before starting the task.

### 5. Wire into application code

Reference by compose service name: `http://proxy:8080`.

### Custom images

Create a separate Dockerfile (e.g., `stack/infra/Dockerfile.proxy`) and reference with `build: { context: ../.. , dockerfile: stack/infra/Dockerfile.proxy }`. The existing service uses a multi-stage build (builder stage + runtime stage).

---

## Alert Channels

Alerting lives in `stack/framework/run.ts` in `writeAlert()`. On success it writes `logs/alert-<taskName>.txt`, sends a BEL character, and logs the success.

### Adding a channel

Create the channel function (in `run.ts` if small, or `stack/framework/alerts.ts` if substantial):

```typescript
async function sendWebhook(
  taskName: string,
  lastCompletedStep: string,
  finalUrl: string,
): Promise<void> {
  const webhookUrl = process.env.ALERT_WEBHOOK;
  if (!webhookUrl) return; // gracefully skip if not configured

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: taskName,
      step: lastCompletedStep,
      url: finalUrl,
      timestamp: new Date().toISOString(),
    }),
  });
}
```

Call from `handleSuccess()`, catching errors:

```typescript
sendWebhook(taskName, lastCompletedStep, finalUrl).catch((err) => {
  logger.warn("Webhook failed", { error: toErrorMessage(err) });
});
```

Thread config via environment (use the "Environment Variables" section above). For secret config (API keys), use vault details instead.

### Design rules

- **Never throw** — alert failures shouldn't affect task success/failure
- **Fire-and-forget** — don't `await` in the main flow if latency matters
- **Log failures** — use `logger.warn()`
- **Graceful skip** — if config missing, silently skip
- **Keep the file alert** — it's the baseline that always works offline

### Available alert data

`handleSuccess()` in `run.ts` receives `taskName`, `lastCompletedStep`, and `finalUrl` (the browser URL captured by the framework after the task succeeds).
