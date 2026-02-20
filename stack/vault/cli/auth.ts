import type { DatabaseSync } from "node:sqlite";
import { deriveMasterKey } from "../core.js";
import { getMasterKeyFromSession, SESSION_TOKEN_LENGTH } from "../ops/sessions.js";
import { removeEnvVar } from "./env.js";
import { getPassword } from "./prompt.js";

// May mutate .env — clears invalid or expired VAULT_ADMIN tokens.
async function resolveAdminAuth(db: DatabaseSync): Promise<Buffer> {
  const adminToken = process.env.VAULT_ADMIN;
  if (adminToken) {
    const tokenBytes = Buffer.from(adminToken, "base64").length;
    if (tokenBytes !== SESSION_TOKEN_LENGTH) {
      removeEnvVar("VAULT_ADMIN");
      console.error(
        "VAULT_ADMIN is not a valid session token — cleared from .env, falling back to password",
      );
    } else {
      try {
        return getMasterKeyFromSession(db, adminToken);
      } catch {
        removeEnvVar("VAULT_ADMIN");
        console.error("Session expired — cleared from .env, falling back to password");
      }
    }
  }
  const password = await getPassword();
  return deriveMasterKey(db, password);
}

// Convenience wrapper for call sites that need auth but discard the key.
async function ensureAuth(db: DatabaseSync): Promise<void> {
  await resolveAdminAuth(db);
}

export { resolveAdminAuth, ensureAuth };
