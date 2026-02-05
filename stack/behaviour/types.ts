import type { ExtensionHost } from '../extension/host.js';

export interface Credentials {
  email: string;
  password: string;
  checkIntervalMs: number;
}

export interface TaskConfig {
  name: string;
  url: string;
  run: (host: ExtensionHost, creds: Credentials) => Promise<boolean>;
}
