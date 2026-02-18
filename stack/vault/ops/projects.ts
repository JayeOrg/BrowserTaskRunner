import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  KEY_LENGTH,
  aesEncrypt,
  decryptFrom,
  exportProjectToken,
  PROJECT_KEY_COLS,
  PROJECT_DEK_COLS,
} from "../crypto.js";
import { requireString } from "../rows.js";
import { withSavepoint } from "../db.js";

function createProject(db: DatabaseSync, masterKey: Buffer, name: string): string {
  const existing = db.prepare("SELECT 1 FROM projects WHERE name = ?").get(name);
  if (existing) throw new Error(`Project already exists: "${name}"`);

  const projectKey = randomBytes(KEY_LENGTH);
  const wrapped = aesEncrypt(masterKey, projectKey);

  db.prepare(
    "INSERT INTO projects (name, key_iv, key_auth_tag, key_ciphertext) VALUES (?, ?, ?, ?)",
  ).run(name, wrapped.iv, wrapped.authTag, wrapped.ciphertext);

  return exportProjectToken(projectKey);
}

function getProjectKey(db: DatabaseSync, masterKey: Buffer, name: string): Buffer {
  const row = db
    .prepare("SELECT key_iv, key_auth_tag, key_ciphertext FROM projects WHERE name = ?")
    .get(name);
  if (!row) throw new Error(`Project not found: "${name}"`);

  try {
    return decryptFrom(masterKey, row, PROJECT_KEY_COLS);
  } catch (cause) {
    throw new Error(
      `Failed to decrypt project key for "${name}" — master key mismatch or corrupted data`,
      { cause },
    );
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

function rotateProject(db: DatabaseSync, masterKey: Buffer, name: string): string {
  const oldProjectKey = getProjectKey(db, masterKey, name);
  const newProjectKey = randomBytes(KEY_LENGTH);

  withSavepoint(db, "rotate_project", () => {
    const wrapped = aesEncrypt(masterKey, newProjectKey);
    db.prepare(
      "UPDATE projects SET key_iv = ?, key_auth_tag = ?, key_ciphertext = ? WHERE name = ?",
    ).run(wrapped.iv, wrapped.authTag, wrapped.ciphertext, name);

    const detailRows = db
      .prepare(
        "SELECT key, project_dek_iv, project_dek_auth_tag, project_dek_ciphertext FROM details WHERE project = ?",
      )
      .all(name);

    for (const detailRow of detailRows) {
      const detailKey = requireString(detailRow, "key");
      const dek = decryptFrom(oldProjectKey, detailRow, PROJECT_DEK_COLS);
      const rewrapped = aesEncrypt(newProjectKey, dek);

      db.prepare(
        "UPDATE details SET project_dek_iv = ?, project_dek_auth_tag = ?, project_dek_ciphertext = ? WHERE project = ? AND key = ?",
      ).run(rewrapped.iv, rewrapped.authTag, rewrapped.ciphertext, name, detailKey);
    }
  });

  return exportProjectToken(newProjectKey);
}

function renameProject(db: DatabaseSync, oldName: string, newName: string): void {
  const exists = db.prepare("SELECT 1 FROM projects WHERE name = ?").get(oldName);
  if (!exists) throw new Error(`Project not found: "${oldName}"`);

  const conflict = db.prepare("SELECT 1 FROM projects WHERE name = ?").get(newName);
  if (conflict) throw new Error(`Project already exists: "${newName}"`);

  // INSERT+DELETE required — node:sqlite enables PRAGMA foreign_keys by default,
  // So UPDATE on the PK (referenced by details.project FK) would fail.
  withSavepoint(db, "rename_project", () => {
    db.prepare(
      "INSERT INTO projects (name, key_iv, key_auth_tag, key_ciphertext) SELECT ?, key_iv, key_auth_tag, key_ciphertext FROM projects WHERE name = ?",
    ).run(newName, oldName);

    db.prepare("UPDATE details SET project = ? WHERE project = ?").run(newName, oldName);

    db.prepare("DELETE FROM projects WHERE name = ?").run(oldName);
  });
}

export { createProject, getProjectKey, listProjects, removeProject, rotateProject, renameProject };
