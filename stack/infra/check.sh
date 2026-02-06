#!/bin/bash
set -e

# =============================================================================
# SiteCheck - Docker runner script
# =============================================================================

COMPOSE_FILE="stack/infra/docker-compose.yml"
CONTAINER_NAME="infra-sitecheck-1"

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
  --shell           Open a shell in running container
  --logs            Follow logs of running container
  --stop            Stop running container
  --help, -h        Show this help message

Examples:
  npm run check botcLogin           Run botcLogin task
  npm run check botcLogin --detach  Run in background
  npm run check botcLogin --no-vnc  Run without VNC
  npm run check -- --shell          Open shell in container
  npm run check -- --logs           Follow container logs
  npm run check -- --stop           Stop container
EOF
}

# Parse arguments
TASK_NAME=""
DETACH=""
NO_VNC=""
NO_BUILD=""

for arg in "$@"; do
    case $arg in
        --help|-h)
            show_help
            exit 0
            ;;
        --shell)
            docker exec -it "$CONTAINER_NAME" /bin/bash
            exit $?
            ;;
        --logs)
            docker compose -f "$COMPOSE_FILE" logs -f
            exit $?
            ;;
        --stop)
            docker compose -f "$COMPOSE_FILE" down
            exit $?
            ;;
        --detach|-d)
            DETACH="-d"
            ;;
        --no-vnc)
            NO_VNC="true"
            ;;
        --no-build)
            NO_BUILD="true"
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

# Compute hash of source + config files to bust Docker cache when anything relevant changes
SOURCE_HASH=$(git ls-files stack/ package.json package-lock.json | xargs cat 2>/dev/null | shasum -a 256 | cut -c1-12)

# Set environment variables
export TASK_NAME
export SOURCE_HASH

if [ "$NO_VNC" = "true" ]; then
    export ENABLE_VNC=false
fi

# Ensure .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    echo "Copy .env.example to .env and fill in your credentials:"
    echo "  cp .env.example .env"
    exit 1
fi

# Build compose command
COMPOSE_CMD="docker compose -f $COMPOSE_FILE --env-file .env up"

if [ -z "$NO_BUILD" ]; then
    COMPOSE_CMD="$COMPOSE_CMD --build"
fi

if [ -n "$DETACH" ]; then
    COMPOSE_CMD="$COMPOSE_CMD -d"
    echo "Starting in background..."
    echo "Use 'npm run check -- --logs' to follow logs"
    echo "Use 'npm run check -- --stop' to stop"
fi

# Run
$COMPOSE_CMD
