---
description: Add a shared task utility to stack/projects/utils/. Use when creating reusable browser automation patterns that aren't site-specific.
---

# Adding a Task Utility

Shared utilities live in `stack/projects/utils/`. These provide reusable patterns for tasks without adding site-specific knowledge.

## Creating a utility

Add a new file in `stack/projects/utils/`:

```typescript
// stack/projects/utils/assertions.ts
import type { BrowserAPI } from "../../browser/browser.js";

export async function assertUrlChanged(
  browser: BrowserAPI,
  originalUrl: string,
): Promise<{ url: string; title: string }> {
  const { url, title } = await browser.getUrl();
  if (url === originalUrl) {
    throw new Error(`URL did not change from ${originalUrl}`);
  }
  return { url, title };
}
```

## Design rules

1. **No site-specific knowledge** — utilities know _how_ to interact, not _what_ to interact with. Selectors, URLs, and timing values come from the task.

2. **Take `BrowserAPI`, not `Browser`** — accept the interface so tests can use mocks.

3. **Return discriminated results** — prefer `{ found: true, ... } | { found: false, error? }` over throwing. Let the task decide whether "not found" is fatal:

   ```typescript
   export type SelectorResult =
     | { found: true; selector: string }
     | { found: false; error?: string };
   ```

4. **Don't log** — utilities shouldn't create loggers. The calling task owns logging and decides what's worth reporting.

5. **Don't retry** — the framework owns retry loops. Utilities implement a single attempt.

## Existing utilities

| File | Exports | Purpose |
|------|---------|---------|
| `selectors.ts` | `waitForFirst`, `clickFirst`, `fillFirst` | Multi-selector fallback patterns |
| `timing.ts` | `sleep` | Promise-based delay |
| `turnstile.ts` | `detectTurnstile`, `clickTurnstile` | Cloudflare Turnstile detection and clicking |

## Usage in tasks

Import from the actual source module:

```typescript
import { waitForFirst, clickFirst } from "../../utils/selectors.js";
import { sleep } from "../../utils/timing.js";
import { clickTurnstile } from "../../utils/turnstile.js";
```
