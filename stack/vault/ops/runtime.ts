import type { DatabaseSync } from "node:sqlite";
import { decryptFrom, PROJECT_DEK_COLS, VALUE_COLS } from "../crypto.js";

function loadProjectDetails(
  db: DatabaseSync,
  projectKey: Buffer,
  project: string,
  needs: Record<string, string>,
): Record<string, string> {
  const context: Record<string, string> = {};

  const stmt = db.prepare(`
    SELECT project_dek_iv, project_dek_auth_tag, project_dek_ciphertext,
           value_iv, value_auth_tag, value_ciphertext
    FROM details
    WHERE project = ? AND key = ?
  `);

  for (const [localName, detailKey] of Object.entries(needs)) {
    const row = stmt.get(project, detailKey);
    if (!row) {
      throw new Error(`Detail "${detailKey}" not found in project "${project}"`);
    }

    let dek: Buffer;
    try {
      dek = decryptFrom(projectKey, row, PROJECT_DEK_COLS);
    } catch {
      throw new Error(`Failed to decrypt detail "${detailKey}" — invalid project token`);
    }

    let value: Buffer;
    try {
      value = decryptFrom(dek, row, VALUE_COLS);
    } catch {
      throw new Error(`Failed to decrypt value for detail "${detailKey}" — corrupted data`);
    }

    context[localName] = value.toString("utf8");
  }

  return context;
}

export { loadProjectDetails };
