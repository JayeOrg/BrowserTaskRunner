export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export type StepContext = Record<string, unknown>;

export function logStep<T extends string>(
  step: T,
  orderedSteps: readonly T[],
  message: string,
  context?: StepContext,
  ...details: unknown[]
): void {
  const total = orderedSteps.length;
  const index = orderedSteps.indexOf(step);
  const stepNumber = index >= 0 ? String(index + 1) : '?';
  const totalLabel = String(total);
  const label = `${stepNumber}/${totalLabel}`;

  const payload: unknown[] = [];
  if (context && Object.keys(context).length > 0) {
    payload.push(context);
  }
  payload.push(...details);

  console.log(`[${label} ${step}] ${message}`, ...payload);
}

export function logJson<T extends string>(
  step: T,
  orderedSteps: readonly T[],
  label: string,
  value: unknown,
  context?: StepContext,
): void {
  logStep(step, orderedSteps, `${label}:`, context, JSON.stringify(value, null, 2));
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

// Generic step helpers shared by site behaviours
export type StepResult<T, F extends { ok: false }> = { ok: true; value: T } | F;

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

function summarizeFailure(failure: { ok: false; reason?: string; details?: string; finalUrl?: string }): string {
  const pieces = [
    failure.reason,
    failure.details,
    failure.finalUrl,
  ].filter(Boolean);
  return pieces.length > 0 ? pieces.join(' | ') : 'unknown failure';
}

export class StepFailure<F extends { ok: false }, S extends string = string> extends Error {
  constructor(public step: S, public result: F, public context?: StepContext) {
    super(`Step ${step} failed: ${summarizeFailure(result)}`);
  }
}

export function isStepFailure<F extends { ok: false }, S extends string = string>(
  error: unknown,
): error is StepFailure<F, S> {
  return error instanceof StepFailure;
}

export function assertOk<T, F extends { ok: false }, S extends string>(
  step: S,
  orderedSteps: readonly S[],
  result: StepResult<T, F>,
  context?: StepContext,
): asserts result is { ok: true; value: T } {
  if (result.ok) {
    return;
  }

  const message = summarizeFailure(result);
  logStep(step, orderedSteps, `Failing step ${step}: ${message}`, context);
  throw new StepFailure(step, result, context);
}

export interface DebugCapture<TPayload = unknown, TStep extends string = string> {
  step: TStep;
  timestamp: string;
  payload: TPayload;
  truncated?: boolean;
}

export function createDebugCapture<T, S extends string = string>(
  step: S,
  payload: T,
  options?: { maxStringLength?: number },
): DebugCapture<T | string, S> {
  const maxStringLength = options?.maxStringLength ?? 800;

  if (typeof payload === 'string' && payload.length > maxStringLength) {
    return {
      step,
      timestamp: new Date().toISOString(),
      payload: `${payload.slice(0, maxStringLength)}… [truncated ${(payload.length - maxStringLength).toString()} chars]`,
      truncated: true,
    };
  }

  return {
    step,
    timestamp: new Date().toISOString(),
    payload,
    truncated: false,
  };
}

export function createContextLoggers<S extends string>(
  orderedSteps: readonly S[],
  baseContext: StepContext = {},
): {
  logWithContext: (step: S, message: string, extraContext?: StepContext, ...details: unknown[]) => void;
  logJsonWithContext: (step: S, label: string, value: unknown, extraContext?: StepContext) => void;
} {
  const logWithContext = (
    step: S,
    message: string,
    extraContext?: StepContext,
    ...details: unknown[]
  ): void => { logStep(step, orderedSteps, message, { ...baseContext, ...extraContext }, ...details); };

  const logJsonWithContext = (step: S, label: string, value: unknown, extraContext?: StepContext): void =>
    { logJson(step, orderedSteps, label, value, { ...baseContext, ...extraContext }); };

  return { logWithContext, logJsonWithContext };
}

export interface ResultBuildersConfig {
  baseContext?: StepContext;
}

export function createResultBuilders<S extends string, R extends string>(
  config: ResultBuildersConfig = {},
): {
  failure: (
    step: S,
    reason: R,
    details?: string,
    finalUrl?: string,
  ) => { ok: false; step: S; reason: R; details?: string; finalUrl?: string; context?: StepContext };
  success: (
    step: S,
    finalUrl?: string,
  ) => { ok: true; step: S; finalUrl?: string; context?: StepContext };
} {
  const baseContext = { ...config.baseContext };

  function failure(
    step: S,
    reason: R,
    details?: string,
    finalUrl?: string,
  ): { ok: false; step: S; reason: R; details?: string; finalUrl?: string; context?: StepContext } {
    const result: { ok: false; step: S; reason: R; details?: string; finalUrl?: string; context?: StepContext } = {
      ok: false,
      step,
      reason,
      context: { ...baseContext },
    };
    if (details) {
      result.details = details;
    }
    if (finalUrl) {
      result.finalUrl = finalUrl;
    }
    return result;
  }

  function success(
    step: S,
    finalUrl?: string,
  ): { ok: true; step: S; finalUrl?: string; context?: StepContext } {
    const result: { ok: true; step: S; finalUrl?: string; context?: StepContext } = {
      ok: true,
      step,
      context: { ...baseContext },
    };
    if (finalUrl) {
      result.finalUrl = finalUrl;
    }
    return result;
  }

  return { failure, success };
}
