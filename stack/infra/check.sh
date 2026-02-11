#!/bin/bash
set -e

# =============================================================================
# SiteCheck - Docker runner script
# =============================================================================

COMPOSE_FILE="stack/infra/docker-compose.yml"

show_help() {
    cat << EOF
Usage: npm run check <taskName> [options]

Run a SiteCheck task in Docker.

Arguments:
  taskName          Name of the task to run (e.g., botcLogin)

Options:
  --detach, -d      Run in background (detached mode)
  --no-vnc          Disable VNC server
  --no-build        Skip Docker build step
  --rebuild         Force fresh build (no cache)
  --host-dist       Mount local ./dist into container (fast iterations)
  --persist-profile Persist Chrome profile across runs (keeps login sessions)
  --help, -h        Show this help message

Shortcuts:
  npm run logs      Follow container logs
  npm run shell     Open shell in container
  npm run stop      Stop container

Examples:
  npm run check botcLogin                    Run botcLogin task
  npm run check botcLogin --detach           Run in background
  npm run check botcLogin --no-vnc           Run without VNC
  npm run check botcLogin --rebuild          Force fresh Docker build
  npm run check nandosOrder --persist-profile Keep login session across runs
EOF
}

# Parse arguments
TASK_NAME=""
DETACH=""
NO_VNC=""
NO_BUILD=""
REBUILD=""
HOST_DIST=""
PERSIST_PROFILE=""

for arg in "$@"; do
    case $arg in
        --help|-h)
            show_help
            exit 0
            ;;
        --detach|-d)
            DETACH="true"
            ;;
        --no-vnc)
            NO_VNC="true"
            ;;
        --no-build)
            NO_BUILD="true"
            ;;
        --rebuild)
            REBUILD="true"
            ;;
        --host-dist)
            HOST_DIST="true"
            ;;
        --persist-profile)
            PERSIST_PROFILE="true"
            ;;
        -*)
            echo "Unknown option: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
        *)
            if [ -z "$TASK_NAME" ]; then
                TASK_NAME="$arg"
            fi
            ;;
    esac
done

# Validate task name for run commands
if [ -z "$TASK_NAME" ]; then
    echo "Error: Missing task name"
    echo ""
    show_help
    exit 1
fi

# Ensure .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    echo "Copy .env.example to .env and fill in your credentials:"
    echo "  cp .env.example .env"
    exit 1
fi

# Validate at least one vault token exists in .env
# Match VAULT_TOKEN=... (legacy) or VAULT_TOKEN_PROJECT=... (preferred)
if ! grep -qE '^VAULT_TOKEN(_[A-Z0-9_]+=|=).+' .env; then
    echo "Error: .env must define at least one vault token"
    echo "  VAULT_TOKEN_<PROJECT>=<token>  (preferred, e.g. VAULT_TOKEN_NANDOS=...)"
    echo "  VAULT_TOKEN=<token>            (legacy fallback)"
    echo "Generate with: npm run vault -- project export <name>"
    exit 1
fi

# Compute hash from git index (fast - reads blob hashes, not file contents).
# Falls back to timestamp when git isn't available (CI artifacts, tarballs).
SOURCE_HASH=$(git ls-files -s stack/ package.json package-lock.json 2>/dev/null | shasum -a 256 | cut -c1-12)
EMPTY_HASH="01ba4719c80b" # shasum of empty input
if [ -z "$SOURCE_HASH" ] || [ "$SOURCE_HASH" = "$EMPTY_HASH" ]; then
    SOURCE_HASH=$(date +%s)
fi

# Set environment variables
export TASK_NAME
export SOURCE_HASH
export HOST_UID=$(id -u)
export HOST_GID=$(id -g)

if [ "$NO_VNC" = "true" ]; then
    export ENABLE_VNC=false
fi

if [ "$PERSIST_PROFILE" = "true" ]; then
    export PERSIST_CHROME_PROFILE=true
fi

if [ "$HOST_DIST" = "true" ]; then
    echo "Using host dist mount: building locally before run..."
    npm run build
fi

# Force fresh build if requested
if [ "$REBUILD" = "true" ]; then
    echo "Forcing fresh build (no cache)..."
    docker compose -f "$COMPOSE_FILE" --env-file .env build --no-cache
fi

# Build compose command as an array for safe word splitting
COMPOSE_CMD=(docker compose -f "$COMPOSE_FILE")

if [ "$HOST_DIST" = "true" ]; then
    COMPOSE_CMD+=(-f stack/infra/docker-compose.dev.yml)
fi

COMPOSE_CMD+=(--env-file .env up)

# --build by default; skip if --no-build, or if --rebuild already built above
if [ -z "$NO_BUILD" ] && [ -z "$REBUILD" ]; then
    COMPOSE_CMD+=(--build)
fi

if [ -n "$DETACH" ]; then
    COMPOSE_CMD+=(-d)
    echo "Starting in background..."
    echo "Use 'npm run logs' to follow logs"
    echo "Use 'npm run stop' to stop"
fi

# Run
"${COMPOSE_CMD[@]}"
