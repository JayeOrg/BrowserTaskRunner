import "dotenv/config";
import { resolve } from "node:path";
import { loadVault, saveVault, type VaultData } from "./vault.js";

const VAULT_PATH = process.env.VAULT_PATH ?? resolve(import.meta.dirname, "../../vault.enc");

function getPassword(): string {
  const password = process.env.VAULT_PASSWORD;
  if (!password) {
    console.error("Error: VAULT_PASSWORD environment variable is required");
    console.error("Set it in .env or export it before running vault commands");
    process.exit(1);
  }
  return password;
}

function usage(): never {
  console.log(`Usage: npm run vault -- <command> [args]

Commands:
  set <task> <KEY> <VALUE>   Set a secret for a task
  get <task> <KEY>           Get a secret value
  list [task]                List tasks, or keys for a task
  remove <task> [KEY]        Remove a key or all task secrets`);
  process.exit(0);
}

function handleSet(data: VaultData, args: string[], password: string): void {
  const taskName = args[0];
  const key = args[1];
  const value = args[2];
  if (!taskName || !key || !value) {
    console.error("Usage: set <task> <KEY> <VALUE>");
    process.exit(1);
  }
  const existing = data[taskName] ?? {};
  data[taskName] = { ...existing, [key]: value };
  saveVault(VAULT_PATH, password, data);
  console.log(`Set ${key} for task "${taskName}"`);
}

function handleGet(data: VaultData, args: string[]): void {
  const taskName = args[0];
  const key = args[1];
  if (!taskName || !key) {
    console.error("Usage: get <task> <KEY>");
    process.exit(1);
  }
  const taskSecrets = data[taskName];
  if (!taskSecrets) {
    console.error(`No vault entry for task "${taskName}"`);
    process.exit(1);
  }
  const value = taskSecrets[key];
  if (value === undefined) {
    console.error(`Key "${key}" not found for task "${taskName}"`);
    process.exit(1);
  }
  console.log(value);
}

function handleList(data: VaultData, args: string[]): void {
  const taskName = args[0];
  if (!taskName) {
    const tasks = Object.keys(data);
    if (tasks.length === 0) {
      console.log("Vault is empty");
      return;
    }
    for (const task of tasks) {
      const secrets = data[task];
      const count = secrets ? Object.keys(secrets).length : 0;
      console.log(`  ${task} (${count.toString()} keys)`);
    }
    return;
  }
  const taskSecrets = data[taskName];
  if (!taskSecrets) {
    console.log(`No vault entry for task "${taskName}"`);
    return;
  }
  for (const key of Object.keys(taskSecrets)) {
    console.log(`  ${key}`);
  }
}

function withoutTask(data: VaultData, taskName: string): VaultData {
  const result: VaultData = {};
  for (const [tk, tv] of Object.entries(data)) {
    if (tk !== taskName) result[tk] = tv;
  }
  return result;
}

function removeTask(data: VaultData, taskName: string, password: string): void {
  if (!data[taskName]) {
    console.error(`No vault entry for task "${taskName}"`);
    process.exit(1);
  }
  saveVault(VAULT_PATH, password, withoutTask(data, taskName));
  console.log(`Removed all secrets for task "${taskName}"`);
}

function removeKey(data: VaultData, taskName: string, key: string, password: string): void {
  const taskSecrets = data[taskName];
  if (!taskSecrets || taskSecrets[key] === undefined) {
    console.error(`Key "${key}" not found for task "${taskName}"`);
    process.exit(1);
  }
  const remaining: Record<string, string> = {};
  for (const [sk, sv] of Object.entries(taskSecrets)) {
    if (sk !== key) remaining[sk] = sv;
  }
  if (Object.keys(remaining).length === 0) {
    saveVault(VAULT_PATH, password, withoutTask(data, taskName));
  } else {
    data[taskName] = remaining;
    saveVault(VAULT_PATH, password, data);
  }
  console.log(`Removed ${key} for task "${taskName}"`);
}

function handleRemove(data: VaultData, args: string[], password: string): void {
  const taskName = args[0];
  if (!taskName) {
    console.error("Usage: remove <task> [KEY]");
    process.exit(1);
  }
  const key = args[1];
  if (key) {
    removeKey(data, taskName, key, password);
  } else {
    removeTask(data, taskName, password);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);

  if (!command || command === "help" || command === "--help") {
    usage();
  }

  const password = getPassword();
  const data = loadVault(VAULT_PATH, password);

  switch (command) {
    case "set":
      handleSet(data, commandArgs, password);
      break;
    case "get":
      handleGet(data, commandArgs);
      break;
    case "list":
      handleList(data, commandArgs);
      break;
    case "remove":
      handleRemove(data, commandArgs, password);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
  }
}

main();
