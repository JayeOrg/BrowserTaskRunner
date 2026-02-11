---
description: Update an existing extension command's schema, response, or behavior. Use when modifying a browser automation primitive (not adding a new one).
---

# Updating a Browser API Command

When modifying an existing command (e.g., adding a parameter to `click` or changing `waitForSelector`'s response), the change surface differs from adding a new command.

## Files to touch

### 1. Update the command file in `stack/extension/messages/commands/`

Modify the zod schema, response interface, or handler:

```typescript
// stack/extension/messages/commands/click.ts

// Adding an optional parameter:
export const clickSchema = z.object({
  selector: z.string(),
  force: z.boolean().optional(),  // new field
});

// Adding to the response:
export interface ClickResponse extends BaseResponse {
  type: "click";
  clicked: boolean;  // new field
}
```

The schema validates input — existing callers that don't pass the new field still work if it's `optional()`.

### 2. Update `stack/extension/messages/index.ts` (usually no changes needed)

The command and response types are inferred from the command file. Changes propagate automatically via `CommandMessage` and `ResponseMessage` unions unless you renamed the type.

### 3. Update `BrowserAPI` interface and `Browser` class in `stack/browser/browser.ts`

If you changed the method signature (new required parameter):

```typescript
// Interface
export interface BrowserAPI {
  click(selector: string, force?: boolean): Promise<ResponseFor<"click">>;
}

// Implementation
click(selector: string, force?: boolean) {
  return this.send({ type: "click", selector, force });
}
```

If you only changed the response shape, the `ResponseFor<"click">` type updates automatically.

### 4. Update the mock in `tests/fixtures/mock-browser.ts`

Match the new response shape:

```typescript
click: vi.fn().mockResolvedValue({ type: "click", clicked: true }),
```

### 5. Update tests

- **Unit tests** (`tests/unit/projects/utils/`): Update mock return values
- **Integration tests** (`tests/integration/browser/browser.test.ts`): Update fake extension responses

### 6. Update call sites in tasks

Search for existing callers:

```bash
# Find all uses of the command
rg "browser\.click" stack/projects/
```

Update if the change is breaking (new required parameter, changed return shape).

## Backward compatibility considerations

- **Adding optional params**: Non-breaking — existing callers don't need changes
- **Adding response fields**: Non-breaking — callers that don't read the new field are fine
- **Changing required params**: Breaking — update all call sites
- **Removing response fields**: Breaking — check all callers that destructure the response
- **Renaming**: Breaking everywhere — update command file, index.ts unions, Browser class, mock, tests, and tasks

## Type safety guarantees

- The `satisfies Record<CommandMessage["type"], CommandHandler>` in `index.ts` ensures every command has a handler
- The `ResponseFor<T>` type automatically maps command types to response types
- TypeScript will error at build time if any call site passes wrong types

Always run `npm run validate` after changes.
