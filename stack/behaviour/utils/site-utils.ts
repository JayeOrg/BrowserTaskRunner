/* eslint-disable max-classes-per-file */
import type { TaskFailReason, TaskResultFailure } from '../types.js';

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
    public readonly reason: TaskFailReason,
    meta: StepErrorMeta = {},
  ) {
    super(`${task}.${step}: ${reason}`);
    this.name = 'StepError';
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

/**
 * StepLogger encapsulates step tracking state for a single task execution.
 * Create a new instance for each task run to avoid shared mutable state.
 */
export class StepLogger {
  private stepNum = 0;
  private lastStep = '';

  log(task: string, step: string, msg: string, data?: Record<string, unknown>): void {
    if (step !== this.lastStep) {
      this.stepNum++;
      this.lastStep = step;
    }
    const prefix = `[${this.stepNum.toString()} ${step}]`;
    console.log(prefix, msg, data ? { task, ...data } : { task });
  }

  fail(task: string, step: string, reason: TaskFailReason, meta: StepErrorMeta = {}): never {
    this.log(task, step, reason, meta);
    throw new StepError(task, step, reason, meta);
  }

  reset(): void {
    this.stepNum = 0;
    this.lastStep = '';
  }
}

// Default global instance for backwards compatibility
// Consider migrating to instance-based usage for better isolation
const defaultLogger = new StepLogger();

export const log = (task: string, step: string, msg: string, data?: Record<string, unknown>) => {
  defaultLogger.log(task, step, msg, data);
};

export const resetSteps = () => { defaultLogger.reset(); };

export const fail = (task: string, step: string, reason: TaskFailReason, meta: StepErrorMeta = {}): never =>
  defaultLogger.fail(task, step, reason, meta);
