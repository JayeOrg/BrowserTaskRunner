FROM node:20-slim

# Install Chromium and dependencies (works on ARM64 and amd64)
RUN apt-get update && apt-get install -y \
    chromium \
    xvfb \
    x11vnc \
    fluxbox \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy extension and source
COPY solutions/extension ./solutions/extension
COPY solutions/docker ./solutions/docker

# Set display for Xvfb
ENV DISPLAY=:99
ENV CHROME_PATH=/usr/bin/chromium

# Expose VNC port (optional, for debugging)
EXPOSE 5900

# Expose WebSocket port
EXPOSE 8765

# Start script
CMD ["./solutions/docker/start.sh"]
