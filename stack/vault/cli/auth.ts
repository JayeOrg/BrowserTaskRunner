import type { DatabaseSync } from "node:sqlite";
import { deriveMasterKey } from "../core.js";
import { KEY_LENGTH } from "../crypto.js";
import { getMasterKeyFromSession, SESSION_TOKEN_LENGTH } from "../ops/sessions.js";
import { removeEnvVar } from "./env.js";
import { getPassword } from "./prompt.js";

// Resolves admin authentication via session token or password prompt.
// May mutate .env (clears invalid/expired VAULT_ADMIN tokens).
async function resolveAdminAuth(db: DatabaseSync): Promise<Buffer> {
  const adminToken = process.env.VAULT_ADMIN;
  if (adminToken) {
    const tokenBytes = Buffer.from(adminToken, "base64").length;
    if (tokenBytes === KEY_LENGTH) {
      removeEnvVar("VAULT_ADMIN");
      console.error(
        `VAULT_ADMIN contains a project token (${KEY_LENGTH.toString()} bytes), not a session token (${SESSION_TOKEN_LENGTH.toString()} bytes) — cleared from .env, falling back to password`,
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

export { resolveAdminAuth };
