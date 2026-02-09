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
  --help, -h        Show this help message

Shortcuts:
  npm run logs      Follow container logs
  npm run shell     Open shell in container
  npm run stop      Stop container

Examples:
  npm run check botcLogin           Run botcLogin task
  npm run check botcLogin --detach  Run in background
  npm run check botcLogin --no-vnc  Run without VNC
  npm run check botcLogin --rebuild Force fresh Docker build
EOF
}

# Parse arguments
TASK_NAME=""
DETACH=""
NO_VNC=""
NO_BUILD=""
REBUILD=""

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

# Validate required environment variables in .env
if ! grep -qE '^VAULT_TOKEN=.+' .env; then
    echo "Error: .env must define VAULT_TOKEN with a non-empty value"
    echo "Generate one with: npm run vault -- project export <name>"
    exit 1
fi

# Compute hash from git index (fast - reads blob hashes, not file contents).
# Falls back to timestamp when git isn't available (CI artifacts, tarballs).
SOURCE_HASH=$(git ls-files -s stack/ package.json package-lock.json 2>/dev/null | shasum -a 256 | cut -c1-12)
if [ -z "$SOURCE_HASH" ] || [ "$SOURCE_HASH" = "$(echo '' | shasum -a 256 | cut -c1-12)" ]; then
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

# Force fresh build if requested
if [ "$REBUILD" = "true" ]; then
    echo "Forcing fresh build (no cache)..."
    docker compose -f "$COMPOSE_FILE" --env-file .env build --no-cache
fi

# Build compose command as an array for safe word splitting
COMPOSE_CMD=(docker compose -f "$COMPOSE_FILE" --env-file .env up)

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
