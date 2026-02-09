import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

export function setup(): void {
  if (!existsSync("dist/vault/cli/main.js")) {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- build step
    execSync("npx tsc", { stdio: "pipe" });
  }
}
