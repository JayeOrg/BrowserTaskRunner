import { readFileSync, writeFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { openVault, openVaultReadOnly } from "../core.js";

// Defaults resolve to project root relative to stack/vault/cli/
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
  const isCommentLine = (line: string): boolean => line.trimStart().startsWith("#");
  const idx = lines.findIndex((line) => !isCommentLine(line) && line.startsWith(prefix));
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
    return;
  }
  const prefix = `${key}=`;
  const isCommentLine = (line: string): boolean => line.trimStart().startsWith("#");
  const lines = content
    .split("\n")
    .filter((line) => isCommentLine(line) || !line.startsWith(prefix));
  const remaining = lines.join("\n").trimEnd();
  writeFileSync(ENV_PATH, remaining.length > 0 ? `${remaining}\n` : "", "utf8");
}

async function withVault<T>(fn: (db: DatabaseSync) => T | Promise<T>): Promise<T> {
  const db = openVault(VAULT_PATH);
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

async function withVaultReadOnly<T>(fn: (db: DatabaseSync) => T | Promise<T>): Promise<T> {
  const db = openVaultReadOnly(VAULT_PATH);
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export { VAULT_PATH, setEnvVar, removeEnvVar, withVault, withVaultReadOnly };
