# SiteCheck BotC Login Watcher

This repository contains a Playwright script that retries logging into https://botc.app/ every 5 minutes until it succeeds, then plays an alert.

## Setup

```bash
npm install
```

## Usage

Create a local env file, then run the script:

```bash
cp .env.example .env
# edit .env with your credentials
npm run login
```

The script loads environment variables from `.env` (via `dotenv`), so you can keep test account credentials there.

To run with a visible browser window:

```bash
BOTC_HEADLESS=false npm run login
```

### Optional environment variables

- `BOTC_LOGIN_URL`: Override the login URL (defaults to `https://botc.app/`).
- `BOTC_SUCCESS_SELECTOR`: A selector that should be visible when login succeeds.
- `BOTC_CHECK_INTERVAL_MS`: Override the retry interval in milliseconds (defaults to 300000).
- `BOTC_HEADLESS`: Set to `false` to show the browser window (defaults to `true`).

The script uses a simple heuristic to detect success when `BOTC_SUCCESS_SELECTOR` is not set. If the site uses a different success indicator, provide a selector for a reliable signal.
