FROM node:20-slim

# Install Chromium and dependencies (works on ARM64 and amd64)
# Note: Chromium requires --no-sandbox when running as root in Docker.
# This is safe because Docker provides its own isolation layer.
# See: https://github.com/nicholasdille/without-systemd/issues/4
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    x11vnc \
    x11-utils \
    scrot \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy only package manifests to maximize cache reuse
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source and build inputs
COPY tsconfig.json ./

# Cache-bust: this arg changes when source files change
ARG SOURCE_HASH=unknown
COPY stack ./stack

# Build TypeScript
RUN npm run build

# Set display for Xvfb
ENV DISPLAY=:99
ENV CHROME_PATH=/usr/bin/chromium

# Expose VNC port (optional, for debugging)
EXPOSE 5900

# Expose WebSocket port
EXPOSE 8765

# Start script
CMD ["./stack/infra/start.sh"]
