Changes needed to make the project production-ready. Not worth the toil today.

## Docker image pinning

Pin base images to SHA256 digests for reproducible builds:

```dockerfile
FROM node:22-slim@sha256:<digest> AS builder
FROM node:22-slim@sha256:<digest>
```

Pin chromium to a specific version: `chromium=<version>`.

Requires updating digests on every base image bump. Acceptable for CI-driven builds, tedious for personal use.

## Password strength enforcement

Add a minimum length check in `getNewPassword()` (e.g. 8+ characters). Currently accepts any string including empty.

## Container hardening

- Add `cap_drop: [ALL]` to docker-compose.yml (only add back capabilities that are needed).
- Set memory/CPU limits to prevent runaway resource usage.
- Consider `read_only: true` filesystem with explicit `tmpfs` for `/tmp`.

## Docker HEALTHCHECK

Add a `HEALTHCHECK` instruction to the Dockerfile so Docker can detect hung containers. Could check if the WebSocket server is accepting connections.
