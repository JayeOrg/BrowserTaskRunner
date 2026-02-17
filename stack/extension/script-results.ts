import { z } from "zod";

const ScriptErrorSchema = z.object({
  error: z.string(),
});

export const RectSchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});

export type Rect = z.infer<typeof RectSchema>;

const ScriptFoundSchema = z.object({
  found: z.boolean(),
  timedOut: z.boolean().optional(),
  selector: z.string().optional(),
  matchedText: z.string().optional(),
  rect: RectSchema.optional(),
});

const ScriptContentSchema = z.object({
  content: z.string(),
  found: z.boolean().optional(),
});

export type ScriptErrorResult = z.infer<typeof ScriptErrorSchema>;
export type ScriptFoundResult = z.infer<typeof ScriptFoundSchema>;
export type ScriptContentResult = z.infer<typeof ScriptContentSchema>;

export function isScriptError(value: unknown): value is ScriptErrorResult {
  return ScriptErrorSchema.safeParse(value).success;
}

export function extractResult(
  results: { result?: unknown }[],
): { ok: true; value: unknown } | { ok: false; error: string } {
  const result = results[0]?.result;
  if (isScriptError(result)) {
    return { ok: false, error: result.error };
  }
  if (result === undefined) {
    return { ok: false, error: "Script did not execute" };
  }
  return { ok: true, value: result };
}

export function isScriptFound(value: unknown): value is ScriptFoundResult {
  return ScriptFoundSchema.safeParse(value).success;
}

/** Stricter guard that also verifies `matchedText` is present (used by clickText). */
export function isScriptFoundWithText(
  value: unknown,
): value is ScriptFoundResult & { found: true; matchedText: string } {
  const parsed = ScriptFoundSchema.safeParse(value);
  return parsed.success && parsed.data.found && typeof parsed.data.matchedText === "string";
}

export function isScriptContent(value: unknown): value is ScriptContentResult {
  return ScriptContentSchema.safeParse(value).success;
}
