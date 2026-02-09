import type { DatabaseSync } from "node:sqlite";
import { getMasterKey } from "../core.js";
import { getMasterKeyFromSession } from "../ops/sessions.js";
import { removeEnvVar } from "./env.js";
import { getPassword } from "./prompt.js";

async function getAdminMasterKey(db: DatabaseSync): Promise<Buffer> {
  const adminToken = process.env.VAULT_ADMIN;
  if (adminToken) {
    try {
      return getMasterKeyFromSession(db, adminToken);
    } catch {
      removeEnvVar("VAULT_ADMIN");
      console.error("Admin session expired — cleared from .env, falling back to password");
    }
  }
  const password = await getPassword();
  return getMasterKey(db, password);
}

export { getAdminMasterKey };
