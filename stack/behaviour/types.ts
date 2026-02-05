import type { ExtensionHost } from '../extension/host.js';

export interface Credentials {
  email: string;
  password: string;
  checkIntervalMs: number;
}

export type LoginFailReason =
  | 'EMAIL_INPUT_NOT_FOUND'
  | 'PASSWORD_INPUT_NOT_FOUND'
  | 'SUBMIT_NOT_FOUND'
  | 'STILL_ON_LOGIN_PAGE';

export interface LoginResultSuccess {
  ok: true;
  finalUrl?: string;
}

export interface LoginResultFailure {
  ok: false;
  reason: LoginFailReason;
  finalUrl?: string;
  details?: string;
}

export type LoginResult = LoginResultSuccess | LoginResultFailure;

export interface TaskConfig {
  name: string;
  url: string;
  run: (host: ExtensionHost, creds: Credentials) => Promise<LoginResult>;
}
