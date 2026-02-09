import type { DatabaseSync } from "node:sqlite";
import { aesDecrypt } from "../crypto.js";
import { requireBlob } from "../rows.js";

function loadProjectDetails(
  db: DatabaseSync,
  projectKey: Buffer,
  project: string,
  needs: Record<string, string>,
): Record<string, string> {
  const context: Record<string, string> = {};

  const stmt = db.prepare(`
    SELECT project_dek_iv, project_dek_auth_tag, project_wrapped_dek,
           value_iv, value_auth_tag, ciphertext
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
      dek = aesDecrypt(
        projectKey,
        requireBlob(row, "project_dek_iv"),
        requireBlob(row, "project_dek_auth_tag"),
        requireBlob(row, "project_wrapped_dek"),
      );
    } catch {
      throw new Error(`Failed to decrypt detail "${detailKey}" — invalid project token`);
    }

    let value: Buffer;
    try {
      value = aesDecrypt(
        dek,
        requireBlob(row, "value_iv"),
        requireBlob(row, "value_auth_tag"),
        requireBlob(row, "ciphertext"),
      );
    } catch {
      throw new Error(`Failed to decrypt value for detail "${detailKey}" — corrupted data`);
    }

    context[localName] = value.toString("utf8");
  }

  return context;
}

export { loadProjectDetails };
