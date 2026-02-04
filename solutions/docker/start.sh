#!/bin/bash
set -e

# Cleanup function
cleanup() {
    echo "Cleaning up..."
    pkill -f Xvfb || true
    pkill -f fluxbox || true
    pkill -f chromium || true
    rm -f /tmp/.X99-lock
    rm -f /tmp/.X11-unix/X99
    # Remove Chrome profile locks to prevent "profile in use" errors
    rm -f /tmp/chrome-profile/SingletonLock
    rm -f /tmp/chrome-profile/SingletonSocket
    rm -f /tmp/chrome-profile/SingletonCookie
}

# Clean up any stale processes/files from previous runs
cleanup

# Set trap to clean up on exit
trap cleanup EXIT

echo "Starting virtual display..."
Xvfb :99 -screen 0 1280x720x24 &
XVFB_PID=$!
sleep 2

# Verify Xvfb started
if ! kill -0 $XVFB_PID 2>/dev/null; then
    echo "ERROR: Xvfb failed to start"
    exit 1
fi

echo "Starting window manager..."
fluxbox &
sleep 1

# Optional: Start VNC server for debugging
if [ "$ENABLE_VNC" = "true" ]; then
    echo "Starting VNC server on port 5900..."
    x11vnc -display :99 -forever -nopw -quiet &
fi

echo "Starting Chromium with extension..."
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
    --load-extension=/app/solutions/extension/extension \
    --user-data-dir=/tmp/chrome-profile \
    "about:blank" &

sleep 3

echo "Starting login script..."
node /app/dist/solutions/extension/index.js
