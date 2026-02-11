import { StepError, type StepErrorMeta } from "./errors.js";

export type LogOutput = (message: string) => void;

const defaultOutput: LogOutput = (message) => {
  console.log(message);
};

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

type LogLevel = "info" | "success" | "warn" | "error";

const levelStyles: Record<LogLevel, { icon: string; color: string }> = {
  info: { icon: "→", color: colors.cyan },
  success: { icon: "✓", color: colors.green },
  warn: { icon: "⚠", color: colors.yellow },
  error: { icon: "✗", color: colors.red },
};

function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString()}:${remainingSeconds.toFixed(0).padStart(2, "0")}`;
}

function getTermWidth(): number {
  return process.stdout.columns || 120;
}

// eslint-disable-next-line no-control-regex, sonarjs/no-control-regex
export const ANSI_PATTERN = /\x1b\[[0-9;]*m/gu;

function rightJustify(content: string, suffix: string): string {
  const visibleLength = content.replace(ANSI_PATTERN, "").length;
  const suffixLength = suffix.length;
  const padding = Math.max(1, getTermWidth() - visibleLength - suffixLength);
  return `${content}${" ".repeat(padding)}${colors.dim}${suffix}${colors.reset}`;
}

interface StepState {
  stepNum: number;
  lastStep: string;
  lastTime: number;
}

function createStepState(): StepState {
  return { stepNum: 0, lastStep: "", lastTime: Date.now() };
}

function formatData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) {
    return "";
  }
  const values = Object.values(data);
  if (values.length === 1) {
    return ` → ${String(values[0])}`;
  }
  const pairs = Object.entries(data).map(([key, val]) => `${key}=${String(val)}`);
  return ` → ${pairs.join(", ")}`;
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
  // Indent task steps (they run under framework's attempt loop)
  const content = `${color}${icon}${colors.reset}    ${prefix} ${msg}${formatData(data)}`;
  output(rightJustify(content, duration));
}

// Step-scoped logger — step name is pre-filled by StepRunner
export interface StepLogger {
  log: (msg: string, data?: Record<string, unknown>) => void;
  success: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  fail: (reason: string, meta?: StepErrorMeta) => never;
}

// Task-level logger — step name required per call (used by framework internals)
export interface TaskLogger {
  log: (step: string, msg: string, data?: Record<string, unknown>) => void;
  success: (step: string, msg: string, data?: Record<string, unknown>) => void;
  warn: (step: string, msg: string, data?: Record<string, unknown>) => void;
  fail: (step: string, reason: string, meta?: StepErrorMeta) => never;
  scoped: (step: string) => StepLogger;
}

export function createTaskLogger(task: string, output: LogOutput = defaultOutput): TaskLogger {
  const state = createStepState();

  const logAt =
    (level: LogLevel) =>
    (step: string, msg: string, data?: Record<string, unknown>): void => {
      formatLogLine(state, step, msg, data, level, output);
    };

  const fail = (step: string, reason: string, meta: StepErrorMeta = {}): never => {
    formatLogLine(state, step, reason, meta, "error", output);
    throw new StepError(task, step, reason, meta);
  };

  const scoped = (step: string): StepLogger => {
    const info = logAt("info");
    const success = logAt("success");
    const warning = logAt("warn");
    return {
      log: (msg, data) => {
        info(step, msg, data);
      },
      success: (msg, data) => {
        success(step, msg, data);
      },
      warn: (msg, data) => {
        warning(step, msg, data);
      },
      fail: (reason, meta) => fail(step, reason, meta),
    };
  };

  return {
    log: logAt("info"),
    success: logAt("success"),
    warn: logAt("warn"),
    fail,
    scoped,
  };
}

// Simple prefix logger for non-task contexts (orchestration, commands, extension)
export interface PrefixLogger {
  log: (msg: string, data?: Record<string, unknown>) => void;
  success: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
}

export function createPrefixLogger(
  prefix: string,
  output: LogOutput = defaultOutput,
): PrefixLogger {
  let lastTime = Date.now();

  const logAt =
    (level: LogLevel) =>
    (msg: string, data?: Record<string, unknown>): void => {
      const now = Date.now();
      const duration = formatDuration(now - lastTime);
      lastTime = now;

      const { icon, color } = levelStyles[level];
      const content = `${color}${icon}${colors.reset} [${prefix}] ${msg}${formatData(data)}`;
      output(rightJustify(content, duration));
    };

  return {
    log: logAt("info"),
    success: logAt("success"),
    warn: logAt("warn"),
    error: logAt("error"),
  };
}
