# Adding an Extension Command

To add a new command (e.g., `screenshot`), touch 3 files:

## 1. Create `stack/extension/messages/commands/screenshot.ts`

Copy an existing command file (`ping.ts` for simple, `click.ts` for one with params). Each file contains:

- `ScreenshotCommand` interface extending `BaseCommand` with `type: "screenshot"`
- `ScreenshotResponse` interface extending `BaseResponse` with `type: "screenshot"`
- `handleScreenshotCommand(msg: IncomingCommand)` — validates params from the raw message, then implements or delegates to a private function

```typescript
import type { BaseCommand, IncomingCommand } from "./base.js";
import type { BaseResponse } from "../responses/base.js";

export interface ScreenshotCommand extends BaseCommand {
  type: "screenshot";
}

export interface ScreenshotResponse extends BaseResponse {
  type: "screenshot";
  data: string;
}

export async function handleScreenshotCommand(
  _msg: IncomingCommand,
): Promise<ScreenshotResponse> {
  // implementation
}
```

## 2. Register in `stack/extension/messages/index.ts`

Four edits:

```typescript
// 1. Add import
import {
  type ScreenshotCommand,
  type ScreenshotResponse,
  handleScreenshotCommand,
} from "./commands/screenshot.js";

// 2. Add to CommandMessage union
export type CommandMessage =
  | ...existing
  | ScreenshotCommand;

// 3. Add to ResponseMessage union
type ResponseMessage =
  | ...existing
  | ScreenshotResponse;

// 4. Add to commandHandlers
const commandHandlers: Record<string, CommandHandler> = {
  ...existing,
  screenshot: handleScreenshotCommand,
};
```

## 3. Add convenience method to `stack/browser/main.ts`

```typescript
screenshot() {
  return this.send({ type: "screenshot" });
}
```

The return type is automatically `Promise<ScreenshotResponse>` via the `ResponseFor` type.

## Why convenience methods exist

Callers could use `browser.send({ type: "screenshot" })` directly — `send()` infers the return type via the `CommandMessage` discriminated union. We keep the convenience methods because the tasks layer calls them far more often than new commands are added. The one-time cost on the command author relieves every call site.
