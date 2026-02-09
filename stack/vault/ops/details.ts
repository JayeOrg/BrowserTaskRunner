import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { KEY_LENGTH, aesEncrypt, aesDecrypt } from "../crypto.js";
import { requireBlob, requireString } from "../rows.js";
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
      value_iv, value_auth_tag, ciphertext,
      master_dek_iv, master_dek_auth_tag, master_wrapped_dek,
      project_dek_iv, project_dek_auth_tag, project_wrapped_dek
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (project, key) DO UPDATE SET
      value_iv = excluded.value_iv,
      value_auth_tag = excluded.value_auth_tag,
      ciphertext = excluded.ciphertext,
      master_dek_iv = excluded.master_dek_iv,
      master_dek_auth_tag = excluded.master_dek_auth_tag,
      master_wrapped_dek = excluded.master_wrapped_dek,
      project_dek_iv = excluded.project_dek_iv,
      project_dek_auth_tag = excluded.project_dek_auth_tag,
      project_wrapped_dek = excluded.project_wrapped_dek
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
      `SELECT value_iv, value_auth_tag, ciphertext,
              master_dek_iv, master_dek_auth_tag, master_wrapped_dek
       FROM details WHERE project = ? AND key = ?`,
    )
    .get(project, key);
  if (!row) throw new Error(`Detail not found: "${project}/${key}"`);

  const dekIv = requireBlob(row, "master_dek_iv");
  const dekAuthTag = requireBlob(row, "master_dek_auth_tag");
  const wrappedDek = requireBlob(row, "master_wrapped_dek");
  const dek = aesDecrypt(masterKey, dekIv, dekAuthTag, wrappedDek);

  const valueIv = requireBlob(row, "value_iv");
  const valueAuthTag = requireBlob(row, "value_auth_tag");
  const ciphertext = requireBlob(row, "ciphertext");
  return aesDecrypt(dek, valueIv, valueAuthTag, ciphertext).toString("utf8");
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
