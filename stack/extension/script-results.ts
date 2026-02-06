import { z } from "zod";

const ScriptErrorSchema = z.object({
  error: z.string(),
});

const RectSchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});

const ScriptFoundSchema = z.object({
  found: z.boolean(),
  timedOut: z.boolean().optional(),
  selector: z.string().optional(),
  rect: RectSchema.optional(),
});

const ScriptContentSchema = z.object({
  content: z.string(),
});

export type ScriptErrorResult = z.infer<typeof ScriptErrorSchema>;
export type ScriptFoundResult = z.infer<typeof ScriptFoundSchema>;
export type ScriptContentResult = z.infer<typeof ScriptContentSchema>;

export function isScriptError(value: unknown): value is ScriptErrorResult {
  return ScriptErrorSchema.safeParse(value).success;
}

export function isScriptFound(value: unknown): value is ScriptFoundResult {
  return ScriptFoundSchema.safeParse(value).success;
}

export function isScriptContent(value: unknown): value is ScriptContentResult {
  return ScriptContentSchema.safeParse(value).success;
}
