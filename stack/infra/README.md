# Docker Infrastructure

Runs Chrome with the extension inside a Docker container with a virtual display.

## Requirements

- Docker
- Docker Compose

## Usage

Run a task:

```bash
npm run check <taskName>
```

Example:

```bash
npm run check botcLogin
```

## Configuration

Secrets are stored in the vault (see `stack/vault/README.md`). The `.env` file needs project tokens:

```bash
# Required — one per project (export from vault)
VAULT_TOKEN_BOTC=<token>
VAULT_TOKEN_NANDOS=<token>

# Optional
# SITE_CHECK_INTERVAL_MS=300000  # 5 minutes (default)
# ENABLE_VNC=true                # Enable VNC debugging (default: true)
# PERSIST_CHROME_PROFILE=false   # Keep Chrome profile between runs
# SCREEN_SIZE=1280x720x24        # Xvfb resolution + depth
# DISPLAY_NUM=99                 # X display number
# WS_PORT=8765                   # WebSocket bridge port
# LOG_DIR=logs                   # Host log directory
# READINESS_TIMEOUT=30           # Seconds to wait for Xvfb
```

The vault database (`vault.db`) is mounted read-only into the container. At runtime, the framework uses the project's `VAULT_TOKEN_<PROJECT>` to decrypt its secrets from the vault.

Each task declares which project and detail keys it needs (see `stack/projects/`).

## Debugging with VNC

VNC is enabled by default. Connect a VNC viewer to see what's happening:

```bash
npm run check botcLogin
# Then connect VNC viewer to localhost:5900 (no password)
```

To disable VNC:

```bash
npm run check botcLogin --no-vnc
```

### Fast local iterations (use host build)

Mount your locally built `dist/` into the container to skip image rebuilds while iterating:

```bash
npm run docker:build                 # one-time to build base image + deps
npm run check botcLogin --host-dist --no-build
```

The `--host-dist` flag runs `npm run build` on the host, then mounts `./dist` read-only into the container via `stack/infra/docker-compose.dev.yml`.

## How It Works

1. Container starts Xvfb (virtual display)
2. Chrome launches with the extension pre-loaded
3. Node.js WebSocket server starts
4. Extension connects and receives commands
5. Task executes and reports result

## Architecture

```
┌────────────────────────────────────────┐
│           Docker Container             │
│                                        │
│  ┌─────────┐    ┌──────────────────┐   │
│  │  Xvfb   │───▶│  Chrome + Ext    │   │
│  │ :99     │    │                  │   │
│  └─────────┘    └────────┬─────────┘   │
│                          │ WebSocket   │
│                          ▼             │
│                 ┌──────────────────┐   │
│                 │   Node.js        │   │
│                 │   run.js         │   │
│                 └──────────────────┘   │
└────────────────────────────────────────┘
        │
        ▼ VNC (port 5900)
   [VNC Viewer for debugging]
```

## Logs & Alerts

Logs are written to `logs/` in the project root:

- `xvfb.log` - Virtual display logs
- `chromium.log` - Chrome browser logs
- `vnc.log` - VNC server logs

On success, an alert file is written to the project root: `alert-<taskName>.txt`

## Other Commands

```bash
# Follow container logs
npm run logs

# Open a shell in the running container
npm run shell

# Stop containers
npm run stop

# Build without running
npm run docker:build

# Force a fresh build (no cache)
npm run check botcLogin --rebuild
```
