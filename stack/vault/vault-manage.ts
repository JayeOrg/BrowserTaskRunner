import "dotenv/config";
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import { Writable } from "node:stream";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  openVault,
  initVault,
  getMasterKey,
  createProject,
  getProjectKey,
  exportToken,
  listProjects,
  removeProject,
  rotateProject,
  setDetail,
  getDetail,
  listDetails,
  removeDetail,
  createSession,
  getMasterKeyFromSession,
  getSessionExpiry,
  deleteSession,
} from "./vault.js";

const VAULT_PATH = process.env.VAULT_PATH ?? resolve(import.meta.dirname, "../../vault.db");
const ENV_PATH = process.env.ENV_PATH ?? resolve(import.meta.dirname, "../../.env");

function promptHidden(label: string): Promise<string> {
  const muted = new Writable({
    write(_data, _enc, cb) {
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
  process.stderr.write(`${label}: `);
  return new Promise((done) => {
    rl.question("", (line) => {
      rl.close();
      process.stderr.write("\n");
      done(line);
    });
  });
}

// Buffer all piped stdin lines on first read so multiple readStdinLine calls work
let stdinBuffer: Promise<string[]> | null = null;
let stdinIndex = 0;

function bufferStdin(): Promise<string[]> {
  return new Promise((done) => {
    const lines: string[] = [];
    const rl = createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      lines.push(line);
    });
    rl.on("close", () => {
      done(lines);
    });
  });
}

async function readStdinLine(errorMessage: string): Promise<string> {
  if (stdinBuffer === null) {
    stdinBuffer = bufferStdin();
  }
  const lines = await stdinBuffer;
  const result = lines[stdinIndex];
  if (result === undefined) {
    throw new Error(errorMessage);
  }
  stdinIndex += 1;
  return result;
}

async function getPassword(): Promise<string> {
  if (process.stdin.isTTY) {
    return promptHidden("Vault password");
  }
  return readStdinLine("No password provided on stdin");
}

async function getSecretValue(): Promise<string> {
  if (process.stdin.isTTY) {
    return promptHidden("Value");
  }
  return readStdinLine("No value provided on stdin");
}

// ── .env helpers ──

function setEnvVar(key: string, value: string): void {
  let content = "";
  try {
    content = readFileSync(ENV_PATH, "utf8");
  } catch {
    // File doesn't exist yet — will create
  }
  const pattern = new RegExp(`^${key}=.*$`, "mu");
  if (pattern.test(content)) {
    content = content.replace(pattern, `${key}=${value}`);
  } else {
    const separator = content.length > 0 ? "\n" : "";
    content = `${content.trimEnd()}${separator}${key}=${value}\n`;
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
  const pattern = new RegExp(`^${key}=.*\n?`, "mu");
  writeFileSync(ENV_PATH, content.replace(pattern, ""), "utf8");
}

// ── Smart auth ──

async function getAdminMasterKey(db: DatabaseSync): Promise<Buffer> {
  const adminToken = process.env.VAULT_ADMIN;
  if (adminToken) {
    try {
      return getMasterKeyFromSession(db, adminToken);
    } catch {
      console.error("Admin session expired or invalid — falling back to password");
    }
  }
  const password = await getPassword();
  return getMasterKey(db, password);
}

function usage(): never {
  console.log(`Usage: npm run vault -- <command> [args]

Commands:
  init                                    Initialize vault
  login [--duration <minutes>]            Start admin session (default 30 min)
  logout                                  End admin session
  status                                  Show current session status

  detail set <project> <key>              Add or update a detail (prompts for value)
  detail get <project> <key>              Show a detail value
  detail list [<project>]                 List details
  detail remove <project> <key>           Remove a detail

  project create <name>                   Create project and output token
  project export <name>                   Export project token
  project list                            List projects
  project remove <name>                   Remove a project (cascades details)
  project rotate <name>                   Rotate project key`);
  process.exit(0);
}

async function handleInit(): Promise<void> {
  const password = await getPassword();
  const db = openVault(VAULT_PATH);
  try {
    initVault(db, password);
    console.log("Vault initialized at", VAULT_PATH);
  } finally {
    db.close();
  }
}

async function handleDetailSet(subArgs: string[]): Promise<void> {
  const project = subArgs[0];
  const key = subArgs[1];
  if (!project || !key) {
    console.error("Usage: detail set <project> <key>");
    process.exit(1);
  }
  const db = openVault(VAULT_PATH);
  try {
    const masterKey = await getAdminMasterKey(db);
    const value = await getSecretValue();
    setDetail(db, masterKey, project, key, value);
    console.log(`Set detail "${key}" in project "${project}"`);
  } finally {
    db.close();
  }
}

async function handleDetailGet(subArgs: string[]): Promise<void> {
  const project = subArgs[0];
  const key = subArgs[1];
  if (!project || !key) {
    console.error("Usage: detail get <project> <key>");
    process.exit(1);
  }
  const db = openVault(VAULT_PATH);
  try {
    const masterKey = await getAdminMasterKey(db);
    console.log(getDetail(db, masterKey, project, key));
  } finally {
    db.close();
  }
}

function handleDetailList(subArgs: string[]): void {
  const db = openVault(VAULT_PATH);
  try {
    const project = subArgs[0];
    const details = listDetails(db, project);
    if (details.length === 0) {
      console.log(project ? `No details in project "${project}"` : "No details in vault");
      return;
    }
    for (const detail of details) {
      console.log(`  ${detail.key} (${detail.project})`);
    }
  } finally {
    db.close();
  }
}

function handleDetailRemove(subArgs: string[]): void {
  const project = subArgs[0];
  const key = subArgs[1];
  if (!project || !key) {
    console.error("Usage: detail remove <project> <key>");
    process.exit(1);
  }
  const db = openVault(VAULT_PATH);
  try {
    removeDetail(db, project, key);
    console.log(`Removed detail "${key}" from project "${project}"`);
  } finally {
    db.close();
  }
}

async function handleDetail(args: string[]): Promise<void> {
  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case "set":
      await handleDetailSet(subArgs);
      break;
    case "get":
      await handleDetailGet(subArgs);
      break;
    case "list":
      handleDetailList(subArgs);
      break;
    case "remove":
      handleDetailRemove(subArgs);
      break;
    default:
      console.error(`Unknown detail subcommand: ${subcommand ?? "(none)"}`);
      usage();
  }
}

async function handleProject(args: string[]): Promise<void> {
  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case "create": {
      const name = subArgs[0];
      if (!name) {
        console.error("Usage: project create <name>");
        process.exit(1);
      }
      const db = openVault(VAULT_PATH);
      try {
        const masterKey = await getAdminMasterKey(db);
        const projectKey = createProject(db, masterKey, name);
        const token = exportToken(projectKey);
        console.log(`Project "${name}" created`);
        console.log(`Token: ${token}`);
      } finally {
        db.close();
      }
      break;
    }
    case "export": {
      const name = subArgs[0];
      if (!name) {
        console.error("Usage: project export <name>");
        process.exit(1);
      }
      const db = openVault(VAULT_PATH);
      try {
        const masterKey = await getAdminMasterKey(db);
        const projectKey = getProjectKey(db, masterKey, name);
        console.log(exportToken(projectKey));
      } finally {
        db.close();
      }
      break;
    }
    case "list": {
      const db = openVault(VAULT_PATH);
      try {
        const projects = listProjects(db);
        if (projects.length === 0) {
          console.log("No projects in vault");
          return;
        }
        for (const project of projects) {
          console.log(`  ${project}`);
        }
      } finally {
        db.close();
      }
      break;
    }
    case "remove": {
      const name = subArgs[0];
      if (!name) {
        console.error("Usage: project remove <name>");
        process.exit(1);
      }
      const db = openVault(VAULT_PATH);
      try {
        removeProject(db, name);
        console.log(`Removed project "${name}"`);
      } finally {
        db.close();
      }
      break;
    }
    case "rotate": {
      const name = subArgs[0];
      if (!name) {
        console.error("Usage: project rotate <name>");
        process.exit(1);
      }
      const db = openVault(VAULT_PATH);
      try {
        const masterKey = await getAdminMasterKey(db);
        const newKey = rotateProject(db, masterKey, name);
        const token = exportToken(newKey);
        console.log(`Rotated key for project "${name}"`);
        console.log(`New token: ${token}`);
      } finally {
        db.close();
      }
      break;
    }
    default:
      console.error(`Unknown project subcommand: ${subcommand ?? "(none)"}`);
      usage();
  }
}

function parseDuration(args: string[]): number {
  const idx = args.indexOf("--duration");
  if (idx === -1) return 30;
  const val = Number(args[idx + 1]);
  if (!Number.isFinite(val) || val <= 0) {
    console.error("--duration must be a positive number of minutes");
    process.exit(1);
  }
  return val;
}

async function handleLogin(args: string[]): Promise<void> {
  const duration = parseDuration(args);
  const password = await getPassword();
  const db = openVault(VAULT_PATH);
  try {
    const masterKey = getMasterKey(db, password);
    const token = createSession(db, masterKey, duration);
    setEnvVar("VAULT_ADMIN", token);
    console.log(`Admin session active for ${duration.toString()} minutes.`);
    console.log("Token written to .env");
  } finally {
    db.close();
  }
}

function handleLogout(): void {
  const token = process.env.VAULT_ADMIN;
  if (!token) {
    console.log("No active admin session");
    return;
  }
  const db = openVault(VAULT_PATH);
  try {
    deleteSession(db, token);
  } catch {
    // Session may already be expired/deleted — still clean up .env
  } finally {
    db.close();
  }
  removeEnvVar("VAULT_ADMIN");
  console.log("Admin session ended");
}

function handleStatus(): void {
  const token = process.env.VAULT_ADMIN;
  if (!token) {
    console.log("No active admin session");
    return;
  }
  const db = openVault(VAULT_PATH);
  try {
    const expiresAt = getSessionExpiry(db, token);
    if (expiresAt === null || Date.now() > expiresAt) {
      console.log("Admin session expired");
      return;
    }
    const remaining = Math.round((expiresAt - Date.now()) / 1000 / 60);
    console.log(`Admin session active — expires in ${remaining.toString()} minutes`);
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);

  if (!command || command === "help" || command === "--help") {
    usage();
  }

  switch (command) {
    case "init":
      await handleInit();
      break;
    case "login":
      await handleLogin(commandArgs);
      break;
    case "logout":
      handleLogout();
      break;
    case "status":
      handleStatus();
      break;
    case "detail":
      await handleDetail(commandArgs);
      break;
    case "project":
      await handleProject(commandArgs);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
