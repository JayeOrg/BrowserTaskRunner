#!/bin/bash
set -e

# =============================================================================
# Configuration
# =============================================================================
DISPLAY_NUM=${DISPLAY_NUM:-99}
WS_PORT=${WS_PORT:-8765}
SCREEN_SIZE=${SCREEN_SIZE:-1280x720x24}
LOG_DIR=${LOG_DIR:-/app/logs}
READINESS_TIMEOUT=${READINESS_TIMEOUT:-30}

export DISPLAY=:${DISPLAY_NUM}

XVFB_LOG="$LOG_DIR/xvfb.log"
CHROMIUM_LOG="$LOG_DIR/chromium.log"
VNC_LOG="$LOG_DIR/vnc.log"
LOG_FILES=("$XVFB_LOG" "$CHROMIUM_LOG" "$VNC_LOG")

# =============================================================================
# Logging utilities
# =============================================================================
LAST_TIME=$(date +%s)
TERM_WIDTH=120

get_elapsed() {
    local now=$(date +%s)
    local elapsed=$((now - LAST_TIME))
    LAST_TIME=$now
    echo "${elapsed}.0s"
}

log() {
    local duration=$(get_elapsed)
    local text="[Infra] $1"
    local padding=$((TERM_WIDTH - ${#text} - ${#duration} - 2))
    if [ $padding -lt 1 ]; then padding=1; fi
    printf "\033[36m→\033[0m %s%*s\033[2m%s\033[0m\n" "$text" "$padding" "" "$duration"
}

log_success() {
    local duration=$(get_elapsed)
    local text="[Infra] $1"
    local padding=$((TERM_WIDTH - ${#text} - ${#duration} - 2))
    if [ $padding -lt 1 ]; then padding=1; fi
    printf "\033[32m✓\033[0m %s%*s\033[2m%s\033[0m\n" "$text" "$padding" "" "$duration"
}

log_error() {
    local duration=$(get_elapsed)
    local text="[Infra] $1"
    local padding=$((TERM_WIDTH - ${#text} - ${#duration} - 2))
    if [ $padding -lt 1 ]; then padding=1; fi
    printf "\033[31m✗\033[0m %s%*s\033[2m%s\033[0m\n" "$text" "$padding" "" "$duration"
}

# =============================================================================
# Readiness checks
# =============================================================================
wait_for_display() {
    local timeout=$1
    local start=$(date +%s)
    while true; do
        if xdpyinfo -display :${DISPLAY_NUM} >/dev/null 2>&1; then
            return 0
        fi
        local elapsed=$(($(date +%s) - start))
        if [ $elapsed -ge $timeout ]; then
            return 1
        fi
        sleep 0.2
    done
}

wait_for_process() {
    local pid=$1
    local timeout=$2
    local start=$(date +%s)
    while true; do
        if kill -0 $pid 2>/dev/null; then
            return 0
        fi
        local elapsed=$(($(date +%s) - start))
        if [ $elapsed -ge $timeout ]; then
            return 1
        fi
        sleep 0.2
    done
}

# =============================================================================
# Cleanup and lifecycle
# =============================================================================
mkdir -p "$LOG_DIR"

preventChromeProfileInUseErrors() {
    rm -f /tmp/chrome-profile/SingletonLock
    rm -f /tmp/chrome-profile/SingletonSocket
    rm -f /tmp/chrome-profile/SingletonCookie
}

cleanupStaleProcessesAndFiles() {
    pkill -f Xvfb || true
    pkill -f chromium || true
    rm -f /tmp/.X${DISPLAY_NUM}-lock
    rm -f /tmp/.X11-unix/X${DISPLAY_NUM}
    preventChromeProfileInUseErrors
    log "Cleaned up stale processes"
}

capture_screenshot() {
    local screenshot_path="$LOG_DIR/failure-$(date +%Y%m%d-%H%M%S).png"
    # DISPLAY is already exported, scrot uses it automatically
    if scrot "$screenshot_path" 2>/dev/null; then
        log "Screenshot saved: $screenshot_path"
    elif command -v import &>/dev/null; then
        # Fallback to ImageMagick if available
        import -window root "$screenshot_path" 2>/dev/null && \
            log "Screenshot saved: $screenshot_path"
    fi
}

on_exit() {
    local exit_status=$1

    if [ "$exit_status" -ne 0 ]; then
        log_error "Exit with status $exit_status"

        # Capture screenshot on failure
        capture_screenshot

        echo ""
        echo "Recent third-party logs:"
        for logfile in "${LOG_FILES[@]}"; do
            if [ -f "$logfile" ] && [ -s "$logfile" ]; then
                echo "--- $(basename "$logfile") ---"
                tail -n 20 "$logfile" || true
            fi
        done
    fi

    cleanupStaleProcessesAndFiles
}

# Set trap to clean up on exit
trap 'on_exit $?' EXIT

# =============================================================================
# Startup sequence
# =============================================================================
cleanupStaleProcessesAndFiles

log "Configuration: display=:${DISPLAY_NUM}, ws_port=${WS_PORT}, screen=${SCREEN_SIZE}"
log "Logs will be written to $LOG_DIR"

# Start Xvfb with readiness check
Xvfb :${DISPLAY_NUM} -screen 0 ${SCREEN_SIZE} >"$XVFB_LOG" 2>&1 &
XVFB_PID=$!

if ! wait_for_display $READINESS_TIMEOUT; then
    log_error "Xvfb failed to start within ${READINESS_TIMEOUT}s"
    tail -n 20 "$XVFB_LOG" || true
    exit 1
fi
log_success "Virtual display :${DISPLAY_NUM} ready"

# Start VNC if enabled
if [ "$ENABLE_VNC" = "true" ]; then
    x11vnc -display :${DISPLAY_NUM} -forever -nopw -quiet >>"$VNC_LOG" 2>&1 &
    log_success "VNC server started on port 5900"
fi

# Start Chromium
# Note: --no-sandbox is required when running as root in Docker.
# Docker provides container isolation, making Chrome's sandbox redundant.
chromium \
    --no-sandbox \
    --disable-gpu \
    --disable-dev-shm-usage \
    --no-first-run \
    --no-default-browser-check \
    --disable-background-networking \
    --disable-sync \
    --disable-translate \
    --metrics-recording-only \
    --disable-features=MediaRouter,MediaCapture \
    --disable-notifications \
    --start-maximized \
    --load-extension=/app/dist/extension \
    --user-data-dir=/tmp/chrome-profile \
    "about:blank" >>"$CHROMIUM_LOG" 2>&1 &
CHROMIUM_PID=$!

# Wait for Chromium to start (brief delay for extension to load)
sleep 2
if ! kill -0 $CHROMIUM_PID 2>/dev/null; then
    log_error "Chromium failed to start"
    tail -n 20 "$CHROMIUM_LOG" || true
    exit 1
fi
log_success "Chromium started with extension (pid: $CHROMIUM_PID)"

# Validate task name
if [ -z "$TASK_NAME" ]; then
    log_error "TASK_NAME environment variable is required"
    exit 1
fi

# Run the task
log "Starting task: $TASK_NAME"
node /app/dist/runner/main.js "$TASK_NAME"
