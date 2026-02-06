import type { ExtensionHost } from "../extension/host.js";

// Generic context passed to tasks - tasks extract what they need
export type TaskContext = Record<string, string>;

// Runner configuration
export interface TaskSchedule {
  checkIntervalMs: number;
}

// Failure reasons - add new values as needed
export type TaskFailReason =
  // Generic
  | "ELEMENT_NOT_FOUND"
  | "TIMEOUT"
  | "UNEXPECTED_STATE"
  | "MISSING_CREDENTIALS"
  // Login-specific
  | "EMAIL_INPUT_NOT_FOUND"
  | "PASSWORD_INPUT_NOT_FOUND"
  | "SUBMIT_NOT_FOUND"
  | "STILL_ON_LOGIN_PAGE";

export interface TaskResultSuccess {
  ok: true;
  step: string;
  finalUrl?: string;
  context?: Record<string, unknown>;
}

export interface TaskResultFailure {
  ok: false;
  step: string;
  reason: TaskFailReason;
  finalUrl?: string;
  details?: string;
  context?: Record<string, unknown>;
}

export type TaskResult = TaskResultSuccess | TaskResultFailure;

export interface TaskConfig {
  name: string;
  url: string;
  run: (host: ExtensionHost, context: TaskContext) => Promise<TaskResult>;
}
