import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const VAULT_PATH = process.env.VAULT_PATH ?? resolve(import.meta.dirname, "../../../vault.db");
const ENV_PATH = process.env.ENV_PATH ?? resolve(import.meta.dirname, "../../../.env");

function setEnvVar(key: string, value: string): void {
  let content = "";
  try {
    content = readFileSync(ENV_PATH, "utf8");
  } catch {
    // File doesn't exist yet — will create
  }
  const lines = content.split("\n");
  const prefix = `${key}=`;
  const idx = lines.findIndex((line) => line.startsWith(prefix));
  if (idx !== -1) {
    lines[idx] = `${prefix}${value}`;
    content = lines.join("\n");
  } else {
    const separator = content.length > 0 ? "\n" : "";
    content = `${content.trimEnd()}${separator}${prefix}${value}\n`;
  }
  writeFileSync(ENV_PATH, content, "utf8");
}

function removeEnvVar(key: string): void {
  let content: string;
  try {
    content = readFileSync(ENV_PATH, "utf8");
  } catch {
    return; // No .env — nothing to remove
  }
  const prefix = `${key}=`;
  const lines = content.split("\n").filter((line) => !line.startsWith(prefix));
  writeFileSync(ENV_PATH, lines.join("\n"), "utf8");
}

export { VAULT_PATH, setEnvVar, removeEnvVar };
