import type { ExtensionHost } from '../extension/host.js';

export interface Credentials {
  email: string;
  password: string;
}

export interface TaskSchedule {
  checkIntervalMs: number;
}

export type LoginFailReason =
  | 'EMAIL_INPUT_NOT_FOUND'
  | 'PASSWORD_INPUT_NOT_FOUND'
  | 'SUBMIT_NOT_FOUND'
  | 'STILL_ON_LOGIN_PAGE';

export interface LoginResultSuccess {
  ok: true;
  step: string;
  finalUrl?: string;
  context?: Record<string, unknown>;
}

export interface LoginResultFailure {
  ok: false;
  step: string;
  reason: LoginFailReason;
  finalUrl?: string;
  details?: string;
  context?: Record<string, unknown>;
}

export type LoginResult = LoginResultSuccess | LoginResultFailure;

export interface TaskConfig {
  name: string;
  url: string;
  run: (host: ExtensionHost, creds: Credentials) => Promise<LoginResult>;
}
