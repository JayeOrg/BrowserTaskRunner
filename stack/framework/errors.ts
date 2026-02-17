export type StepErrorMeta = Record<string, unknown> & {
  finalUrl?: string;
  /** Human-readable explanation of what went wrong. */
  details?: string;
  /** Structured key-value debug data (selectors tried, URLs seen, etc.). */
  context?: Record<string, unknown>;
};

export class StepError extends Error {
  public readonly meta: StepErrorMeta;

  constructor(
    public readonly task: string,
    public readonly step: string,
    public readonly reason: string,
    meta: StepErrorMeta = {},
  ) {
    super(`${task}.${step}: ${reason}`);
    this.name = "StepError";
    this.meta = meta;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
