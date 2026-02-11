import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { KEY_LENGTH, aesEncrypt, decryptFrom, MASTER_DEK_COLS, VALUE_COLS } from "../crypto.js";
import { requireString } from "../rows.js";
import { getProjectKey } from "./projects.js";

function setDetail(
  db: DatabaseSync,
  masterKey: Buffer,
  project: string,
  key: string,
  value: string,
): void {
  const dek = randomBytes(KEY_LENGTH);
  const valueEnc = aesEncrypt(dek, Buffer.from(value, "utf8"));
  const masterDekWrapped = aesEncrypt(masterKey, dek);
  const projectKey = getProjectKey(db, masterKey, project);
  const projectDekWrapped = aesEncrypt(projectKey, dek);

  db.prepare(
    `
    INSERT INTO details (
      key, project,
      value_iv, value_auth_tag, value_ciphertext,
      master_dek_iv, master_dek_auth_tag, master_dek_ciphertext,
      project_dek_iv, project_dek_auth_tag, project_dek_ciphertext
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (project, key) DO UPDATE SET
      value_iv = excluded.value_iv,
      value_auth_tag = excluded.value_auth_tag,
      value_ciphertext = excluded.value_ciphertext,
      master_dek_iv = excluded.master_dek_iv,
      master_dek_auth_tag = excluded.master_dek_auth_tag,
      master_dek_ciphertext = excluded.master_dek_ciphertext,
      project_dek_iv = excluded.project_dek_iv,
      project_dek_auth_tag = excluded.project_dek_auth_tag,
      project_dek_ciphertext = excluded.project_dek_ciphertext
  `,
  ).run(
    key,
    project,
    valueEnc.iv,
    valueEnc.authTag,
    valueEnc.ciphertext,
    masterDekWrapped.iv,
    masterDekWrapped.authTag,
    masterDekWrapped.ciphertext,
    projectDekWrapped.iv,
    projectDekWrapped.authTag,
    projectDekWrapped.ciphertext,
  );
}

function getDetail(db: DatabaseSync, masterKey: Buffer, project: string, key: string): string {
  const row = db
    .prepare(
      `SELECT value_iv, value_auth_tag, value_ciphertext,
              master_dek_iv, master_dek_auth_tag, master_dek_ciphertext
       FROM details WHERE project = ? AND key = ?`,
    )
    .get(project, key);
  if (!row) throw new Error(`Detail not found: "${project}/${key}"`);

  // Unwrap DEK via master key, then decrypt value
  const dek = decryptFrom(masterKey, row, MASTER_DEK_COLS);
  return decryptFrom(dek, row, VALUE_COLS).toString("utf8");
}

function listDetails(db: DatabaseSync, project?: string): Array<{ key: string; project: string }> {
  if (project !== undefined) {
    const rows = db
      .prepare("SELECT key, project FROM details WHERE project = ? ORDER BY key")
      .all(project);
    return rows.map((row) => ({
      key: requireString(row, "key"),
      project: requireString(row, "project"),
    }));
  }
  const rows = db.prepare("SELECT key, project FROM details ORDER BY project, key").all();
  return rows.map((row) => ({
    key: requireString(row, "key"),
    project: requireString(row, "project"),
  }));
}

function removeDetail(db: DatabaseSync, project: string, key: string): void {
  const result = db.prepare("DELETE FROM details WHERE project = ? AND key = ?").run(project, key);
  if (result.changes === 0) {
    throw new Error(`Detail not found: "${project}/${key}"`);
  }
}

export { setDetail, getDetail, listDetails, removeDetail };
