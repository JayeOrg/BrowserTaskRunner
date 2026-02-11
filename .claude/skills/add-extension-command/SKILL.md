---
description: Add a new extension command (e.g., screenshot, scroll). Use when adding browser automation primitives to the extension layer.
---

# Adding an Extension Command

To add a new command (e.g., `screenshot`), touch 4 files:

## 1. Create `stack/extension/messages/commands/screenshot.ts`

Copy an existing command file (`ping.ts` for simple, `click.ts` for one with params). Each file contains:

- A zod schema for input validation
- `ScreenshotCommand` type derived from the schema with `type: "screenshot"`
- `ScreenshotResponse` interface extending `BaseResponse` with `type: "screenshot"`
- `handleScreenshot` function that receives the validated input

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

## 2. Register in `stack/extension/messages/index.ts`

Five edits:

```typescript
// 1. Add import
import {
  screenshotSchema,
  handleScreenshot,
  type ScreenshotCommand,
  type ScreenshotResponse,
} from "./commands/screenshot.js";

// 2. Add to CommandMessage union
export type CommandMessage =
  | ...existing
  | ScreenshotCommand;

// 3. Add to ResponseMessage union
type ResponseMessage =
  | ...existing
  | ScreenshotResponse;

// 4. Add to commandHandlers (uses `satisfies` — missing entries are compile errors)
const commandHandlers = {
  ...existing,
  screenshot: createHandler(screenshotSchema, handleScreenshot),
} satisfies Record<CommandMessage["type"], CommandHandler>;
```

The `satisfies` constraint guarantees every command in the union has a handler. If you add to `CommandMessage` but forget the handler, TypeScript will error.

## 3. Add to `BrowserAPI` interface and `Browser` class in `stack/browser/browser.ts`

Add the method to the `BrowserAPI` interface:

```typescript
export interface BrowserAPI {
  ...existing,
  screenshot(): Promise<ResponseFor<"screenshot">>;
}
```

Add the convenience method to the `Browser` class:

```typescript
screenshot() {
  return this.send({ type: "screenshot" });
}
```

The return type is automatically `Promise<ScreenshotResponse>` via the `ResponseFor` type.

## 4. Add to mock browser in `tests/fixtures/mock-browser.ts`

```typescript
screenshot: vi.fn().mockResolvedValue({ type: "screenshot", data: "" }),
```

Pick a sensible default that matches the response shape.

## 5. Add to default responder in `tests/fixtures/test-helpers.ts`

Add a case to the `createDefaultResponder` switch:

```typescript
case "screenshot":
  return { type: "screenshot", data: "" };
```

## 6. Add integration tests in `tests/integration/browser/browser.test.ts`

Add at least one round-trip test:

```typescript
it("screenshot() sends command and receives response", async () => {
  setup = await setupBrowser();
  const p = setup.browser.screenshot();
  const cmd = await setup.ext.receiveCommand();
  expect(cmd.type).toBe("screenshot");
  setup.ext.sendResponse({ id: cmd.id, type: "screenshot", data: "base64..." });
  const result = await p;
  expect(result.data).toBe("base64...");
});
```

## Why convenience methods exist

Callers could use `browser.send({ type: "screenshot" })` directly — `send()` infers the return type via the `CommandMessage` discriminated union. We keep the convenience methods because the tasks layer calls them far more often than new commands are added. The one-time cost on the command author relieves every call site.

## Gotchas

### DOM access inside injected functions

The `func` callback in `chrome.scripting.executeScript` runs in the page context, but TypeScript/ESLint type-checks it in the extension build context. Two patterns work cleanly:

- **`document.querySelector` in a loop** (see `querySelectorRect.ts`) — returns `Element | null`, narrow with `if (element)`, then `.getBoundingClientRect()` is properly typed.
- **XPath via `document.evaluate`** (see `click-text.ts`) — returns `XPathResult`, narrow with `node instanceof Element`.

**Avoid** iterating `document.querySelectorAll` with `for...of` — the `NodeListOf` iterator yields `any` in this context, triggering `@typescript-eslint/no-unsafe-member-access` on every property access.

### Returning structured results from injected scripts

Use `isScriptFound` / `isScriptError` from `../../script-results.ts` to validate the `results[0]?.result` from `executeScript`. The `ScriptFoundSchema` expects `{ found, selector?, rect?, timedOut? }`. If you need to pass custom data back (like matched text), put it in the `selector` field — don't invent new fields, or `isScriptFound` won't validate them.

Serialize `DOMRect` manually (extract `left`, `top`, `width`, `height` into a plain object) — `DOMRect` doesn't survive the Chrome serialization boundary as-is.

### `undefined` is not serializable in executeScript args

Chrome's `executeScript` serializes `args` values via structured clone. `undefined` is **not serializable** and throws `"Value is unserializable"` at runtime. When passing optional schema fields (e.g., `input.tag` from a `z.string().optional()`), always coalesce to `null`: `args: [input.texts, input.tag ?? null]`. Use `string | null` (not `string | undefined`) for the corresponding function parameter type.

### Floating promises on executeScript

`chrome.scripting.executeScript` returns a `Promise`. Even for fire-and-forget helpers, you must `await` it or ESLint flags `@typescript-eslint/no-floating-promises`. Make helper functions `async` and `await` the call.

### CDP click helpers are shared via `clicks.ts`

`domClickAt` and `cdpClickAt` live in `stack/extension/clicks.ts` and are imported by `cdp-click.ts` and `click-text.ts`.

### iframe support via `getScriptTarget`

Commands that use `chrome.scripting.executeScript` should support iframe targeting. Import `getScriptTarget` from `../../script-target.js` and add `frameId: z.number().optional()` to the schema:

```typescript
import { getScriptTarget } from "../../script-target.js";

export const myCommandSchema = z.object({
  selector: z.string(),
  frameId: z.number().optional(),
});

export async function handleMyCommand(input) {
  const target = await getScriptTarget(input.frameId);
  const results = await chrome.scripting.executeScript({ target, ... });
}
```

On the browser side, add `options?: { frameId?: number }` to the method signature and spread it into the `send()` call.
