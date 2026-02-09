---
description: Add or modify browser connection instructions shown during local development. Use when changing how developers connect the Chrome extension.
---

# Adding a Browser Instruction

Browser instructions are developer-facing setup messages shown when running locally. They live in `stack/browser/instructions.ts`.

## How it works

`logConnectionInstructions(logger, port)` prints step-by-step instructions for connecting the Chrome extension to the WebSocket server. It only runs in local development — it skips when `DOCKER`, `CI`, or `VITEST` env vars are set.

## When to modify

- Adding a new setup step (e.g., a required Chrome flag)
- Changing the extension path or load procedure
- Adding environment-specific instructions

## Structure

The function takes a `PrefixLogger` and the WebSocket port:

```typescript
export function logConnectionInstructions(
  logger: PrefixLogger,
  port: number,
): void {
  if (process.env.DOCKER || process.env.CI || process.env.VITEST) return;

  logger.log("Connect Chrome extension:");
  logger.log(`  1. Open chrome://extensions`);
  logger.log(`  2. Enable Developer mode`);
  logger.log(`  3. Load unpacked → dist/extension/client`);
  logger.log(`  4. Open any tab (extension needs an active tab)`);
  logger.log(`  WebSocket port: ${port}`);
}
```

## Adding a step

Edit the function directly — add or modify the log lines. Keep instructions numbered and concise.

## Adding environment-specific behavior

Check environment variables at the top of the function:

```typescript
if (process.env.SOME_FLAG) {
  logger.log("  Extra step: ...");
}
```

The `PrefixLogger` provides `log()`, `success()`, `warn()`, and `error()` methods with consistent formatting.
