# Rejected: Infra

Won't-fix decisions for `stack/infra/`, Docker, and compose. Check before proposing changes to these modules.

- **Module-level side effects in `infra/run.ts`**: Docker container entrypoint — not importable in tests. `process.env` mutation needed before Xvfb spawn; current ordering is correct.
- **`handleExit` naming in `infra/run.ts`**: Communicates "this is what happens when we exit." Both signal-triggered and imperative exits run the same cleanup. `teardown` is equally valid but no clearer.
- **`timeout` parameter lacks unit suffix in `infra/run.ts`**: Private function, called once, with constant named `READINESS_TIMEOUT`. Unit is clear from context.
- **Private logger functions in `infra/run.ts`**: Completely separate file from framework logging. File location already separates contexts. No cross-imports.
- **Port 8765 undocumented in `Dockerfile`**: Compose file maps the port with purpose clear from context. Low-value comment.
- **`SOURCE_HASH` cache-busting comment in `Dockerfile`**: Well-known Docker pattern. Expanding the comment would explain Docker fundamentals, not project-specific logic.
- **`SCREEN_SIZE`/`LOG_DIR` absent from compose environment**: Code-level defaults exist. Adding to compose creates a second source of truth.
- **`restart: "no"` explicit in `docker-compose.yml`**: The explicit value IS the comment — signals intentional choice, not oversight.
- **`LOG_DIR` host vs container path in `infra/README.md`**: README shows host-side perspective (`logs/`), code runs inside container (`/app/logs`). Both correct for their context.
- **`run-utils.ts` single-function file**: `tailLines` extracted from `run.ts` for test isolation — `run.ts` has module-level side effects preventing direct import in tests. The file is small and self-explanatory.
- **`CHROME_PROFILE_DIR` hardcoded in infra config block**: Internal constant tied to cleanup() logic. Not user-configurable. README documents `PERSIST_CHROME_PROFILE` (the flag), not the path.
