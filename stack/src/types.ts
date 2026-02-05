export interface Credentials {
  email: string;
  password: string;
  loginUrl: string;
  checkIntervalMs: number;
}

export interface SiteLoginFlow {
  name: string;
  run: (host: import('../extension/host.js').ExtensionHost, creds: Credentials) => Promise<boolean>;
}
