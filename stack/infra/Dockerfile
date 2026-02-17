## Builder stage — install all deps, compile TypeScript
FROM node:22-slim AS builder

WORKDIR /app

# Copy only package manifests to maximize cache reuse
COPY package*.json ./
RUN npm ci

# Copy source and build inputs
COPY tsconfig.json ./

# Cache-bust: this arg changes when source files change
ARG SOURCE_HASH=unknown
COPY stack ./stack

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --omit=dev

## Runtime stage — lean image with only production deps
FROM node:22-slim

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

WORKDIR /app

# Copy production node_modules and built output from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# Extension dir must be writable so run.ts can create ws-port at runtime
RUN chmod a+w /app/dist/extension
COPY --from=builder /app/package.json ./package.json

# Set display for Xvfb
ENV DISPLAY=:99
ENV CHROME_PATH=/usr/bin/chromium

# Expose VNC port (optional, for debugging)
EXPOSE 5900

# Expose WebSocket port
EXPOSE 8765

# Start entrypoint (compiled from stack/infra/run.ts)
CMD ["node", "dist/infra/run.js"]
