#!/bin/bash
set -e

LOG_DIR=${LOG_DIR:-/app/docker/logs}
XVFB_LOG="$LOG_DIR/xvfb.log"
CHROMIUM_LOG="$LOG_DIR/chromium.log"
VNC_LOG="$LOG_DIR/vnc.log"

mkdir -p "$LOG_DIR"

# Cleanup function
cleanup() {
    echo "Cleaning up..."
    pkill -f Xvfb || true
    pkill -f chromium || true
    rm -f /tmp/.X99-lock
    rm -f /tmp/.X11-unix/X99
    # Remove Chrome profile locks to prevent "profile in use" errors
    rm -f /tmp/chrome-profile/SingletonLock
    rm -f /tmp/chrome-profile/SingletonSocket
    rm -f /tmp/chrome-profile/SingletonCookie
}

on_exit() {
    status=$1
    cleanup
    if [ "$status" -ne 0 ]; then
        echo "Non-zero exit detected (${status}). Recent third-party logs:"
        for log in "$XVFB_LOG" "$CHROMIUM_LOG" "$VNC_LOG"; do
            if [ -f "$log" ]; then
                echo "--- $(basename "$log") ---"
                tail -n 20 "$log" || true
            fi
        done
    fi
}

# Clean up any stale processes/files from previous runs
cleanup

# Set trap to clean up on exit and surface log tails if something failed
trap 'on_exit $?' EXIT

echo "Logs will be written to $LOG_DIR"

echo "Starting virtual display..."
Xvfb :99 -screen 0 1280x720x24 >"$XVFB_LOG" 2>&1 &
XVFB_PID=$!
sleep 2

# Verify Xvfb started
if ! kill -0 $XVFB_PID 2>/dev/null; then
    echo "ERROR: Xvfb failed to start"
    tail -n 20 "$XVFB_LOG" || true
    exit 1
fi
echo "Xvfb logs -> $XVFB_LOG"

# Optional: Start VNC server for debugging
if [ "$ENABLE_VNC" = "true" ]; then
    echo "Starting VNC server on port 5900..."
    x11vnc -display :99 -forever -nopw -quiet >>"$VNC_LOG" 2>&1 &
    echo "VNC logs -> $VNC_LOG"
fi

echo "Starting Chromium with extension..."
chromium \
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
    --load-extension=/app/stack/extension/extension \
    --user-data-dir=/tmp/chrome-profile \
    "about:blank" >>"$CHROMIUM_LOG" 2>&1 &
echo "Chromium logs -> $CHROMIUM_LOG"

sleep 3

echo "Starting login script..."
node /app/dist/extension/index.js
