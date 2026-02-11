import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

export function setup(): void {
  if (!existsSync("dist/vault/cli/main.js")) {
    execSync("npx tsc", { stdio: "pipe" });
  }
}
