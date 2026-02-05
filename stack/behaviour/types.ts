export interface Credentials {
  email: string;
  password: string;
  checkIntervalMs: number;
}

export interface TaskConfig {
  name: string;
  url: string;
  run: (host: import('../extension/host.js').ExtensionHost, creds: Credentials) => Promise<boolean>;
}
