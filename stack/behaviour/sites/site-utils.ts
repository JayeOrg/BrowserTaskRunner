import type { LoginFailReason, LoginResultFailure } from '../types.js';

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

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
    public readonly reason: LoginFailReason,
    meta: StepErrorMeta = {},
  ) {
    super(`${task}.${step}: ${reason}`);
    this.name = 'StepError';
    this.meta = meta;
  }

  toResult(): LoginResultFailure {
    const { finalUrl, details, context } = this.meta;
    const result: LoginResultFailure = {
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

let stepNum = 0;
let lastStep = '';

export const log = (task: string, step: string, msg: string, data?: Record<string, unknown>) => {
  if (step !== lastStep) {
    stepNum++;
    lastStep = step;
  }
  const prefix = `[${stepNum.toString()} ${step}]`;
  console.log(prefix, msg, data ? { task, ...data } : { task });
};

export const resetSteps = () => { stepNum = 0; lastStep = ''; };

export const fail = (task: string, step: string, reason: LoginFailReason, meta: StepErrorMeta = {}): never => {
  log(task, step, reason, meta);
  throw new StepError(task, step, reason, meta);
};
