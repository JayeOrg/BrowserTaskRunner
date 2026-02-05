#!/bin/bash
set -e

LOG_DIR=${LOG_DIR:-/app/logs}
XVFB_LOG="$LOG_DIR/xvfb.log"
CHROMIUM_LOG="$LOG_DIR/chromium.log"
VNC_LOG="$LOG_DIR/vnc.log"
LOG_FILES=("$XVFB_LOG" "$CHROMIUM_LOG" "$VNC_LOG")

# Timing for logs
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
    # Visual width: icon(1) + space(1) + text + padding + duration = TERM_WIDTH
    local padding=$((TERM_WIDTH - ${#text} - ${#duration} - 2))
    if [ $padding -lt 1 ]; then padding=1; fi
    printf "\033[36m→\033[0m %s%*s\033[2m%s\033[0m\n" "$text" "$padding" "" "$duration"
}

log_success() {
    local duration=$(get_elapsed)
    local text="[Infra] $1"
    # Visual width: icon(1) + space(1) + text + padding + duration = TERM_WIDTH
    local padding=$((TERM_WIDTH - ${#text} - ${#duration} - 2))
    if [ $padding -lt 1 ]; then padding=1; fi
    printf "\033[32m✓\033[0m %s%*s\033[2m%s\033[0m\n" "$text" "$padding" "" "$duration"
}

mkdir -p "$LOG_DIR"

preventChromeProfileInUseErrors() {
    rm -f /tmp/chrome-profile/SingletonLock
    rm -f /tmp/chrome-profile/SingletonSocket
    rm -f /tmp/chrome-profile/SingletonCookie
}

cleanupStaleProcessesAndFiles() {
    pkill -f Xvfb || true
    pkill -f chromium || true
    rm -f /tmp/.X99-lock
    rm -f /tmp/.X11-unix/X99
    preventChromeProfileInUseErrors
    log "Cleaned up stale processes"
}

verifyXvfbInstalled() {
    if ! kill -0 $XVFB_PID 2>/dev/null; then
        log "ERROR: Xvfb failed to start"
        tail -n 20 "$XVFB_LOG" || true
        exit 1
    fi
    log_success "Virtual display started"
}

startVNCForDebug() {
    x11vnc -display :99 -forever -nopw -quiet >>"$VNC_LOG" 2>&1 &
    log_success "VNC server started on port 5900"
}

on_exit() {
    local exit_status=$1
    cleanupStaleProcessesAndFiles
    if [ "$exit_status" -ne 0 ]; then
        echo "Non-zero exit detected (${exit_status}). Recent third-party logs:"
        for logfile in "${LOG_FILES[@]}"; do
            if [ -f "$logfile" ]; then
                echo "--- $(basename "$logfile") ---"
                tail -n 20 "$logfile" || true
            fi
        done
    fi
}

cleanupStaleProcessesAndFiles

# Set trap to clean up on exit and surface log tails if something failed
trap 'on_exit $?' EXIT

log "Logs will be written to $LOG_DIR"

Xvfb :99 -screen 0 1280x720x24 >"$XVFB_LOG" 2>&1 &
XVFB_PID=$!
sleep 2

verifyXvfbInstalled

if [ "$ENABLE_VNC" = "true" ]; then
    startVNCForDebug
fi

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
    --load-extension=/app/dist/extension/extension \
    --user-data-dir=/tmp/chrome-profile \
    "about:blank" >>"$CHROMIUM_LOG" 2>&1 &

sleep 3
log_success "Chromium started with extension"

if [ -z "$TASK_NAME" ]; then
    log "ERROR: TASK_NAME environment variable is required"
    exit 1
fi

log "Starting task: $TASK_NAME"
node /app/dist/behaviour/run-task.js "$TASK_NAME"
