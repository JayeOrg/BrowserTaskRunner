FROM node:20-slim

# Install Chromium and dependencies (works on ARM64 and amd64)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    x11vnc \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy only package manifests to maximize cache reuse
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source and build inputs
COPY tsconfig.json ./
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
CMD ["./stack/docker/start.sh"]
