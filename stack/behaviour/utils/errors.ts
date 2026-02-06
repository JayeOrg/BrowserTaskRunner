import type { TaskFailReason, TaskResultFailure } from "../types.js";

export type StepErrorMeta = Record<string, unknown> & {
  finalUrl?: string;
  details?: string;
  context?: Record<string, unknown>;
};

export class StepError extends Error {
  public readonly meta: StepErrorMeta;

  constructor(
    public readonly task: string,
    public readonly step: string,
    public readonly reason: TaskFailReason,
    meta: StepErrorMeta = {},
  ) {
    super(`${task}.${step}: ${reason}`);
    this.name = "StepError";
    this.meta = meta;
  }

  toResult(): TaskResultFailure {
    const { finalUrl, details, context } = this.meta;
    const result: TaskResultFailure = {
      ok: false,
      step: this.step,
      reason: this.reason,
      context: { task: this.task, ...(context ?? {}) },
    };

    if (finalUrl !== undefined) {
      result.finalUrl = finalUrl;
    }

    if (details !== undefined) {
      result.details = details;
    }

    return result;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
