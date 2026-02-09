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

## 4. Add to mock browser in `tests/unit/projects/utils/testing.ts`

```typescript
screenshot: vi.fn().mockResolvedValue({ type: "screenshot", data: "" }),
```

Pick a sensible default that matches the response shape.

## Why convenience methods exist

Callers could use `browser.send({ type: "screenshot" })` directly — `send()` infers the return type via the `CommandMessage` discriminated union. We keep the convenience methods because the tasks layer calls them far more often than new commands are added. The one-time cost on the command author relieves every call site.
