export type StepErrorMeta = Record<string, unknown> & {
  finalUrl?: string;
  summary?: string;
  diagnostics?: Record<string, unknown>;
};

export class StepError extends Error {
  public readonly meta: StepErrorMeta;

  constructor(
    public readonly task: string,
    public readonly step: string,
    public readonly reason: string,
    meta: StepErrorMeta = {},
  ) {
    // .message = "task.step: reason" — qualified form for logs/catch blocks
    super(`${task}.${step}: ${reason}`);
    this.name = "StepError";
    this.meta = meta;
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
