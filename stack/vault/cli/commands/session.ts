import { initVault, deriveMasterKey, changePassword } from "../../core.js";
import {
  createSession,
  getSessionExpiry,
  deleteSession,
  DEFAULT_SESSION_MINUTES,
} from "../../ops/sessions.js";
import { VAULT_PATH, setEnvVar, removeEnvVar, withVault } from "../env.js";
import { getPassword, getNewPassword } from "../prompt.js";

async function handleInit(): Promise<void> {
  const password = await getNewPassword();
  await withVault((db) => {
    initVault(db, password);
    console.log("Vault initialized at", VAULT_PATH);
  });
}

function parseDuration(args: string[]): number {
  const idx = args.indexOf("--duration");
  if (idx === -1) return DEFAULT_SESSION_MINUTES;
  const raw = args[idx + 1];
  if (raw === undefined) {
    throw new Error("--duration requires a value (minutes)");
  }
  const val = Number(raw);
  if (!Number.isFinite(val) || val <= 0) {
    throw new Error("--duration must be a positive number of minutes");
  }
  return val;
}

async function handleLogin(args: string[]): Promise<void> {
  const duration = parseDuration(args);
  const password = await getPassword();
  await withVault((db) => {
    const masterKey = deriveMasterKey(db, password);
    const token = createSession(db, masterKey, duration);
    setEnvVar("VAULT_ADMIN", token);
    console.error(`Session active for ${duration.toString()} minutes`);
    console.error("Token written to .env");
  });
}

async function handleLogout(): Promise<void> {
  const token = process.env.VAULT_ADMIN;
  if (!token) {
    console.log("No active session");
    return;
  }
  await withVault((db) => {
    try {
      deleteSession(db, token);
    } catch {
      // Session may already be expired/deleted — still clean up .env
    }
  });
  removeEnvVar("VAULT_ADMIN");
  console.log("Session ended");
}

async function handleStatus(): Promise<void> {
  const token = process.env.VAULT_ADMIN;
  if (!token) {
    console.log("No active session");
    return;
  }
  // Read-write because expired sessions are pruned (deleted) as a side effect.
  await withVault((db) => {
    const now = Date.now();
    const result = getSessionExpiry(db, token);

    if (result.status === "invalid-token") {
      removeEnvVar("VAULT_ADMIN");
      console.log("Invalid session token — cleared from .env");
      return;
    }

    if (result.status === "not-found") {
      removeEnvVar("VAULT_ADMIN");
      console.log("Session not found — cleared from .env");
      return;
    }

    if (now > result.expiresAt) {
      try {
        deleteSession(db, token);
      } catch {
        // Already gone — fine
      }
      removeEnvVar("VAULT_ADMIN");
      console.log("Session expired — cleared from .env");
      return;
    }

    const remaining = Math.round((result.expiresAt - now) / 1000 / 60);
    console.log(`Session active — ${remaining.toString()}min remaining (${VAULT_PATH})`);
  });
}

async function handleChangePassword(): Promise<void> {
  const oldPassword = await getPassword();
  const newPassword = await getNewPassword();
  await withVault((db) => {
    changePassword(db, oldPassword, newPassword);
    removeEnvVar("VAULT_ADMIN");
    console.log("Password changed. All sessions invalidated.");
  });
}

export { handleInit, handleLogin, handleLogout, handleStatus, handleChangePassword };
