import type { DatabaseSync } from "node:sqlite";
import { getMasterKey } from "../core.js";
import { getMasterKeyFromSession } from "../ops/sessions.js";
import { getPassword } from "./prompt.js";

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

export { getAdminMasterKey };
