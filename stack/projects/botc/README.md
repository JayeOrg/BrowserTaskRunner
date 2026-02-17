# botc

Login monitor for [botc.app](https://botc.app/). Checks that login is working every 5 minutes.

## Flow

1. Navigate to https://botc.app/
2. Find and fill the email and password inputs
3. Handle Cloudflare Turnstile (pre-submit)
4. Click submit
5. Verify navigation away from login page

## Vault Details

| Detail key | Description    |
|------------|----------------|
| `email`    | Login email    |
| `password` | Login password |

Vault project: `monitor-botc`

## Setup

```bash
npm run vault -- project create monitor-botc
npm run vault -- detail set monitor-botc email user@example.com
npm run vault -- detail set monitor-botc password hunter2
```

## Run

```bash
npm run check botcLogin
```

## Task Config

- **Mode**: `retry` (5 minute intervals)
- **Context schema**: Validates `email` and `password` are non-empty strings
- **Selectors**: Multiple fallback selectors for email, password, and submit inputs
- **Turnstile**: Checked before form submission
