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

// Injectable output function type
export type LogOutput = (message: string) => void;

// Default output: console.log
const defaultOutput: LogOutput = (message) => { console.log(message); };

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

// Log level indicators and colors
type LogLevel = 'info' | 'success' | 'warn' | 'error';

const levelStyles: Record<LogLevel, { icon: string; color: string }> = {
  info: { icon: '→', color: colors.cyan },
  success: { icon: '✓', color: colors.green },
  warn: { icon: '⚠', color: colors.yellow },
  error: { icon: '✗', color: colors.red },
};

function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString()}:${remainingSeconds.toFixed(0).padStart(2, '0')}`;
}

// Terminal width for right-justified elapsed time
const TERM_WIDTH = 120;

// eslint-disable-next-line no-control-regex, require-unicode-regexp, sonarjs/no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function rightJustify(content: string, suffix: string): string {
  // Strip ANSI codes for length calculation
  const visibleLength = content.replace(ANSI_PATTERN, '').length;
  const suffixLength = suffix.length;
  const padding = Math.max(1, TERM_WIDTH - visibleLength - suffixLength);
  return `${content}${' '.repeat(padding)}${colors.dim}${suffix}${colors.reset}`;
}

// Internal step tracker state
interface StepState {
  stepNum: number;
  lastStep: string;
  lastTime: number;
}

function createStepState(): StepState {
  return { stepNum: 0, lastStep: '', lastTime: Date.now() };
}

// Format data for display: simple arrow notation for readability
function formatData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) {
    return '';
  }
  const values = Object.values(data);
  // Single value: just show the value with arrow
  if (values.length === 1) {
    return ` → ${String(values[0])}`;
  }
  // Multiple values: key=value pairs
  const pairs = Object.entries(data).map(([key, val]) => `${key}=${String(val)}`);
  return ` → ${pairs.join(', ')}`;
}

function formatLogLine(
  state: StepState,
  step: string,
  msg: string,
  data: Record<string, unknown> | undefined,
  level: LogLevel,
  output: LogOutput,
): void {
  if (step !== state.lastStep) {
    state.stepNum++;
    state.lastStep = step;
  }

  const now = Date.now();
  const duration = formatDuration(now - state.lastTime);
  state.lastTime = now;

  const { icon, color } = levelStyles[level];
  const prefix = `[${state.stepNum.toString()} ${step}]`;
  // Indent task steps (they run under Runner's attempt)
  const content = `${color}${icon}${colors.reset}    ${prefix} ${msg}${formatData(data)}`;
  output(rightJustify(content, duration));
}

// Task-scoped logger interface (no task param needed per call)
export interface TaskLogger {
  log: (step: string, msg: string, data?: Record<string, unknown>) => void;
  success: (step: string, msg: string, data?: Record<string, unknown>) => void;
  warn: (step: string, msg: string, data?: Record<string, unknown>) => void;
  fail: (step: string, reason: TaskFailReason, meta?: StepErrorMeta) => never;
}

// Creates a logger scoped to a specific task - no manual reset needed
export function createTaskLogger(task: string, output: LogOutput = defaultOutput): TaskLogger {
  const state = createStepState();

  const logAt = (level: LogLevel) => (step: string, msg: string, data?: Record<string, unknown>): void => {
    formatLogLine(state, step, msg, data, level, output);
  };

  const fail = (step: string, reason: TaskFailReason, meta: StepErrorMeta = {}): never => {
    formatLogLine(state, step, reason, meta, 'error', output);
    throw new StepError(task, step, reason, meta);
  };

  return {
    log: logAt('info'),
    success: logAt('success'),
    warn: logAt('warn'),
    fail,
  };
}

// Simple prefix logger for non-task contexts (orchestration, commands, extension)
export interface PrefixLogger {
  log: (msg: string, data?: Record<string, unknown>) => void;
  success: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
}

export function createPrefixLogger(prefix: string, output: LogOutput = defaultOutput): PrefixLogger {
  let lastTime = Date.now();

  const logAt = (level: LogLevel) => (msg: string, data?: Record<string, unknown>): void => {
    const now = Date.now();
    const duration = formatDuration(now - lastTime);
    lastTime = now;

    const { icon, color } = levelStyles[level];
    const content = `${color}${icon}${colors.reset} [${prefix}] ${msg}${formatData(data)}`;
    output(rightJustify(content, duration));
  };

  return {
    log: logAt('info'),
    success: logAt('success'),
    warn: logAt('warn'),
    error: logAt('error'),
  };
}
