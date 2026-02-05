# Docker Solution

Runs Chrome with the extension inside a Docker container with a virtual display.

## Requirements

- Docker
- Docker Compose

## Setup

1. Create a `.env` file in the project root (or set environment variables):

```bash
SITE_EMAIL=your-email@example.com
SITE_PASSWORD=your-password
SITE_LOGIN_URL=https://botc.app/
SITE_CHECK_INTERVAL_MS=300000
```

2. Build and run (from repo root):

```bash
cd stack/infra
docker-compose up --build
```

## Debugging

To see what's happening inside the container, enable VNC:

```bash
ENABLE_VNC=true docker-compose up --build
```

Then connect a VNC viewer to `localhost:5900` (no password).

## How It Works

1. Container starts Xvfb (virtual display)
2. Chrome launches with the extension pre-loaded
3. Node.js WebSocket server starts
4. Extension connects and receives commands
5. Login attempts loop until successful

## Architecture

```
┌─────────────────────────────────────────┐
│           Docker Container              │
│                                         │
│  ┌─────────┐    ┌──────────────────┐   │
│  │  Xvfb   │───▶│  Chrome + Ext    │   │
│  │ :99     │    │                  │   │
│  └─────────┘    └────────┬─────────┘   │
│                          │ WebSocket   │
│                          ▼             │
│                 ┌──────────────────┐   │
│                 │   Node.js        │   │
│                 │   (index.js)     │   │
│                 └──────────────────┘   │
└─────────────────────────────────────────┘
```

Using TigerVNC to visually debug progress on the container's chrome instance
