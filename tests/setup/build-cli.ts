import { execSync } from "node:child_process";

export function setup(): void {
  execSync("npx tsc --incremental", { stdio: "inherit" });
}
