import { openVault, initVault, getMasterKey, changePassword } from "../../core.js";
import {
  createSession,
  getSessionExpiry,
  deleteSession,
  DEFAULT_SESSION_MINUTES,
} from "../../ops/sessions.js";
import { VAULT_PATH, setEnvVar, removeEnvVar } from "../env.js";
import { getPassword, promptHidden, readStdinLine } from "../prompt.js";

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

function parseDuration(args: string[]): number {
  const idx = args.indexOf("--duration");
  if (idx === -1) return DEFAULT_SESSION_MINUTES;
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
    console.log(`Admin session active — ${remaining.toString()}min remaining (${VAULT_PATH})`);
  } finally {
    db.close();
  }
}

async function handleChangePassword(): Promise<void> {
  const db = openVault(VAULT_PATH);
  try {
    let oldPassword: string;
    let newPassword: string;
    if (process.stdin.isTTY) {
      oldPassword = await promptHidden("Current password");
      newPassword = await promptHidden("New password");
      const confirm = await promptHidden("Confirm new password");
      if (newPassword !== confirm) {
        console.error("Passwords do not match");
        process.exit(1);
      }
    } else {
      oldPassword = await readStdinLine("No current password provided on stdin");
      newPassword = await readStdinLine("No new password provided on stdin");
    }
    changePassword(db, oldPassword, newPassword);
    removeEnvVar("VAULT_ADMIN");
    console.log("Password changed. All admin sessions invalidated.");
  } finally {
    db.close();
  }
}

export { handleInit, handleLogin, handleLogout, handleStatus, handleChangePassword };
