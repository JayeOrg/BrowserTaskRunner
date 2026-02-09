import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { KEY_LENGTH, aesEncrypt, aesDecrypt } from "../crypto.js";
import { requireBlob, requireString } from "../rows.js";

function createProject(db: DatabaseSync, masterKey: Buffer, name: string): Buffer {
  const projectKey = randomBytes(KEY_LENGTH);
  const wrapped = aesEncrypt(masterKey, projectKey);

  db.prepare(
    "INSERT INTO projects (name, key_iv, key_auth_tag, encrypted_key) VALUES (?, ?, ?, ?)",
  ).run(name, wrapped.iv, wrapped.authTag, wrapped.ciphertext);

  return projectKey;
}

function getProjectKey(db: DatabaseSync, masterKey: Buffer, name: string): Buffer {
  const row = db
    .prepare("SELECT key_iv, key_auth_tag, encrypted_key FROM projects WHERE name = ?")
    .get(name);
  if (!row) throw new Error(`Project not found: "${name}"`);

  const iv = requireBlob(row, "key_iv");
  const authTag = requireBlob(row, "key_auth_tag");
  const encryptedKey = requireBlob(row, "encrypted_key");

  try {
    return aesDecrypt(masterKey, iv, authTag, encryptedKey);
  } catch {
    throw new Error(`Failed to decrypt project key for "${name}" — wrong master password`);
  }
}

function listProjects(db: DatabaseSync): string[] {
  const rows = db.prepare("SELECT name FROM projects ORDER BY name").all();
  return rows.map((row) => requireString(row, "name"));
}

function removeProject(db: DatabaseSync, name: string): void {
  const result = db.prepare("DELETE FROM projects WHERE name = ?").run(name);
  if (result.changes === 0) {
    throw new Error(`Project not found: "${name}"`);
  }
}

function rotateProject(db: DatabaseSync, masterKey: Buffer, name: string): Buffer {
  const oldProjectKey = getProjectKey(db, masterKey, name);
  const newProjectKey = randomBytes(KEY_LENGTH);

  db.exec("SAVEPOINT rotate_project");
  try {
    const wrapped = aesEncrypt(masterKey, newProjectKey);
    db.prepare(
      "UPDATE projects SET key_iv = ?, key_auth_tag = ?, encrypted_key = ? WHERE name = ?",
    ).run(wrapped.iv, wrapped.authTag, wrapped.ciphertext, name);

    const detailRows = db
      .prepare(
        "SELECT key, project_dek_iv, project_dek_auth_tag, project_wrapped_dek FROM details WHERE project = ?",
      )
      .all(name);

    for (const detailRow of detailRows) {
      const detailKey = requireString(detailRow, "key");
      const dekIv = requireBlob(detailRow, "project_dek_iv");
      const dekAuthTag = requireBlob(detailRow, "project_dek_auth_tag");
      const wrappedDek = requireBlob(detailRow, "project_wrapped_dek");

      const dek = aesDecrypt(oldProjectKey, dekIv, dekAuthTag, wrappedDek);
      const rewrapped = aesEncrypt(newProjectKey, dek);

      db.prepare(
        "UPDATE details SET project_dek_iv = ?, project_dek_auth_tag = ?, project_wrapped_dek = ? WHERE project = ? AND key = ?",
      ).run(rewrapped.iv, rewrapped.authTag, rewrapped.ciphertext, name, detailKey);
    }

    db.exec("RELEASE rotate_project");
  } catch (error) {
    db.exec("ROLLBACK TO rotate_project");
    db.exec("RELEASE rotate_project");
    throw error;
  }

  return newProjectKey;
}

export { createProject, getProjectKey, listProjects, removeProject, rotateProject };
