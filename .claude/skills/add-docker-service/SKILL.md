---
description: Add a new Docker service (e.g., proxy, database) to the infrastructure. Use when the stack needs an additional container.
---

# Adding a Docker Service

The Docker setup lives in `stack/infra/`. Currently there's a single `sitecheck` service.

## 1. Add the service to `stack/infra/docker-compose.yml`

```yaml
services:
  sitecheck:
    # ...existing service...

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

Key considerations:
- Use `restart: on-failure` for reliability
- Services on the default network can reference each other by name
- Map `HOST_UID`/`HOST_GID` if the service writes to shared volumes
- Use `${VAR:-default}` syntax for environment variables with defaults

## 2. Add shared volumes (if needed)

```yaml
volumes:
  shared-data:
    driver: local

services:
  sitecheck:
    volumes:
      - shared-data:/app/shared
  proxy:
    volumes:
      - shared-data:/data
```

Existing volume patterns:
- `./logs:/app/logs` — host-mounted logs directory
- `./vault.db:/app/vault.db:ro` — read-only database mount
- `tmpfs: /tmp/chrome-profile` — ephemeral Chrome data

## 3. Update `stack/infra/check.ts` (if the service needs task-specific config)

If the new service needs the `TASK_NAME` or other runtime config, set it in `process.env` before spawning docker compose. The existing pattern sets env vars and passes them via `docker-compose.yml`'s environment section.

## 4. Update `stack/infra/run.ts` (if sitecheck needs to wait for the service)

Add a readiness check before starting the task:

```typescript
log("Waiting for proxy...");
await waitForService("http://proxy:8080/health", READINESS_TIMEOUT);
logSuccess("Proxy ready");
```

## 5. Wire into application code

Reference the service by its compose name. Inside the Docker network, services resolve by name:

```typescript
const proxyUrl = process.env.PROXY_URL ?? "http://proxy:8080";
```

Use `/add-env-var` to thread new environment variables.

## Build patterns

The existing `sitecheck` service uses a multi-stage Dockerfile:
1. **Builder stage**: Install deps, build TypeScript, prune dev deps
2. **Runtime stage**: Install system packages, copy built artifacts

If the new service needs a custom image, create a separate Dockerfile (e.g., `stack/infra/Dockerfile.proxy`) and reference it:

```yaml
proxy:
  build:
    context: ../..
    dockerfile: stack/infra/Dockerfile.proxy
```

## Running

```bash
npm run check <taskName>              # starts all services
docker compose -f stack/infra/docker-compose.yml logs proxy   # service logs
```
