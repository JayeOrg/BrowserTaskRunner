import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

export const LOGS_DIR = resolve(ROOT, "logs");
export const VAULT_DB = process.env.VAULT_PATH ?? resolve(ROOT, "vault.db");
export const PROJECTS_DIR = resolve(import.meta.dirname, "../projects");
