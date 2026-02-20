---
description: Add or update an extension command, or modify browser connection instructions. Use for changes to stack/extension/ or stack/browser/.
---

# Extension Commands

See AGENTS.md for the extension design principle.

## Adding a Command

To add a new command (e.g., `screenshot`), touch these files:

### 1. Create `stack/extension/messages/commands/screenshot.ts`

Copy an existing command (`ping.ts` for simple, `click.ts` for one with params). Each file contains a zod schema, command type, response interface, and handler:

```typescript
import { z } from "zod";
import type { BaseResponse } from "../responses/base.js";

export const screenshotSchema = z.object({
  selector: z.string().optional(),
});

export type ScreenshotCommand = z.infer<typeof screenshotSchema> & { type: "screenshot" };

export interface ScreenshotResponse extends BaseResponse {
  type: "screenshot";
  data: string;
}

export async function handleScreenshot(
  input: z.infer<typeof screenshotSchema>,
): Promise<ScreenshotResponse> {
  // Implementation — input is already validated by the schema
}
```

### 2. Register in `stack/extension/messages/index.ts`

Four edits: import, add to `CommandMessage` union, add to `ResponseMessage` union, add to `commandHandlers` (uses `satisfies` — missing entries are compile errors).

### 3. Add to `BrowserAPI` and `Browser` in `stack/browser/browser.ts`

Add to the appropriate `BrowserAPI` sub-interface, then add the convenience method to `Browser`.

Sub-interfaces:
- `BrowserNavigation` — URL loading and querying (`navigate`, `getUrl`)
- `BrowserWaiting` — polling/waiting for conditions (`waitForSelector`, `waitForText`, `waitForUrl`)
- `BrowserClicking` — any form of click (`click`, `cdpClick`, `clickText`, `cdpClickSelector`)
- `BrowserFormInput` — filling/selecting form controls (`fill`, `type`, `selectOption`, `check`, `uncheck`)
- `BrowserKeyboard` — raw key events not tied to a form field (`press`, `keyDown`, `keyUp`)
- `BrowserQueries` — read-only page inspection (`getContent`, `getText`, `querySelectorRect`, `getFrameId`)
- `BrowserScrolling` — viewport/element scrolling (`scrollIntoView`, `scrollTo`, `scrollBy`)

Example:

```typescript
screenshot() {
  return this.send({ type: "screenshot" });
}
```

### 4. Add mock in `tests/fixtures/mock-browser.ts`

```typescript
screenshot: vi.fn().mockResolvedValue({ type: "screenshot", data: "" }),
```

### 5. Add default responder in `tests/fixtures/test-helpers.ts`

```typescript
case "screenshot":
  return { type: "screenshot", data: "" };
```

### 6. Add integration test in `tests/integration/browser/browser.test.ts`

At least one round-trip test using `setupBrowser()` and `createQueuedExtension`.

### Gotchas

**DOM access in injected scripts:** The `func` callback in `executeScript` runs in the page context but is type-checked in the extension build context. Use `document.querySelector` in a loop (returns `Element | null`). Avoid `querySelectorAll` with `for...of` — `NodeListOf` iterator yields `any`.

**Returning structured results:** Use `isScriptFound` / `isScriptError` from `script-results.ts`. Serialize `DOMRect` manually (extract `left`, `top`, `width`, `height`).

**`undefined` in executeScript args:** Chrome can't serialize `undefined`. Always coalesce optional schema fields: `args: [input.tag ?? null]`.

**Floating promises:** Always `await` `executeScript` calls.

**CDP click helpers:** `domClickAt` and `cdpClickAt` live in `stack/extension/clicks.ts`.

**iframe support:** Import `getScriptTarget` from `script-target.js`, add `frameId: z.number().optional()` to the schema. See `click.ts` for the full pattern.

---

## Updating a Command

When modifying an existing command (adding a parameter, changing a response), the change surface is smaller than adding a new command.

### Files to touch

1. **Command file** (`stack/extension/messages/commands/`) — modify schema, response, or handler
2. **`index.ts`** — usually no changes needed (types propagate via unions)
3. **`browser.ts`** — update interface + class if method signature changed; response shape changes propagate via `ResponseFor<T>`
4. **`mock-browser.ts`** — match new response shape
5. **Tests** — update assertions and fake responses
6. **Call sites** — search with `rg "browser\.methodName" stack/projects/`

### Backward compatibility

| Change | Breaking? | Action |
|--------|-----------|--------|
| Add optional param | No | Existing callers unaffected |
| Add response field | No | Callers that don't read it are fine |
| Add required param | Yes | Update all call sites |
| Remove response field | Yes | Check all callers that destructure |
| Rename anything | Yes | Update everywhere |

Always run `npm run validate` after changes.

---

## Browser Instructions

Browser instructions are developer-facing setup messages in `stack/browser/instructions.ts`. `logConnectionInstructions(logger, port)` prints step-by-step instructions for connecting the Chrome extension. It skips when `DOCKER`, `CI`, or `VITEST` env vars are set.

To modify: edit the function directly — add or modify log lines. Keep instructions numbered and concise. For environment-specific behavior, check env vars at the top.
