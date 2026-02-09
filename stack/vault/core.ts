import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import {
  SALT_LENGTH,
  IV_LENGTH,
  PASSWORD_CHECK_MAGIC,
  deriveKey,
  aesEncrypt,
  aesDecrypt,
} from "./crypto.js";
import { requireBlob, requireString } from "./rows.js";
import { SCHEMA } from "./schema.js";

function openVault(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

function initVault(db: DatabaseSync, password: string): void {
  const existing = db.prepare("SELECT value FROM config WHERE key = ?").get("salt");
  if (existing) {
    throw new Error("Vault is already initialized");
  }

  const salt = randomBytes(SALT_LENGTH);
  const masterKey = deriveKey(password, salt);

  const check = aesEncrypt(masterKey, Buffer.from(PASSWORD_CHECK_MAGIC, "utf8"));
  const checkBlob = Buffer.concat([check.iv, check.authTag, check.ciphertext]);

  db.prepare("INSERT INTO config (key, value) VALUES (?, ?)").run("salt", salt);
  db.prepare("INSERT INTO config (key, value) VALUES (?, ?)").run("password_check", checkBlob);
}

function verifyPassword(db: DatabaseSync, masterKey: Buffer): void {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get("password_check");
  if (!row) throw new Error("Vault corrupted — missing password check");
  const checkBlob = requireBlob(row, "value");

  const iv = checkBlob.subarray(0, IV_LENGTH);
  const authTag = checkBlob.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = checkBlob.subarray(IV_LENGTH + 16);

  let decrypted: Buffer;
  try {
    decrypted = aesDecrypt(masterKey, iv, authTag, ciphertext);
  } catch {
    throw new Error("Vault decryption failed — wrong password or corrupted vault");
  }

  if (decrypted.toString("utf8") !== PASSWORD_CHECK_MAGIC) {
    throw new Error("Vault decryption failed — wrong password or corrupted vault");
  }
}

function getMasterKey(db: DatabaseSync, password: string): Buffer {
  const saltRow = db.prepare("SELECT value FROM config WHERE key = ?").get("salt");
  if (!saltRow) throw new Error("Vault not initialized. Run 'vault init' first.");
  const salt = requireBlob(saltRow, "value");

  const masterKey = deriveKey(password, salt);
  verifyPassword(db, masterKey);
  return masterKey;
}

function changePassword(db: DatabaseSync, oldPassword: string, newPassword: string): void {
  const saltRow = db.prepare("SELECT value FROM config WHERE key = ?").get("salt");
  if (!saltRow) throw new Error("Vault not initialized. Run 'vault init' first.");
  const oldSalt = requireBlob(saltRow, "value");
  const oldMasterKey = deriveKey(oldPassword, oldSalt);
  verifyPassword(db, oldMasterKey);

  const newSalt = randomBytes(SALT_LENGTH);
  const newMasterKey = deriveKey(newPassword, newSalt);
  const newCheck = aesEncrypt(newMasterKey, Buffer.from(PASSWORD_CHECK_MAGIC, "utf8"));
  const newCheckBlob = Buffer.concat([newCheck.iv, newCheck.authTag, newCheck.ciphertext]);

  db.exec("SAVEPOINT change_password");
  try {
    // Update salt and password check
    db.prepare("UPDATE config SET value = ? WHERE key = ?").run(newSalt, "salt");
    db.prepare("UPDATE config SET value = ? WHERE key = ?").run(newCheckBlob, "password_check");

    // Re-wrap all project keys
    const projects = db
      .prepare("SELECT name, key_iv, key_auth_tag, encrypted_key FROM projects")
      .all();
    for (const project of projects) {
      const projectKey = aesDecrypt(
        oldMasterKey,
        requireBlob(project, "key_iv"),
        requireBlob(project, "key_auth_tag"),
        requireBlob(project, "encrypted_key"),
      );
      const wrapped = aesEncrypt(newMasterKey, projectKey);
      db.prepare(
        "UPDATE projects SET key_iv = ?, key_auth_tag = ?, encrypted_key = ? WHERE name = ?",
      ).run(wrapped.iv, wrapped.authTag, wrapped.ciphertext, requireString(project, "name"));
    }

    // Re-wrap all master-wrapped DEKs
    const details = db
      .prepare(
        "SELECT key, project, master_dek_iv, master_dek_auth_tag, master_wrapped_dek FROM details",
      )
      .all();
    for (const detail of details) {
      const dek = aesDecrypt(
        oldMasterKey,
        requireBlob(detail, "master_dek_iv"),
        requireBlob(detail, "master_dek_auth_tag"),
        requireBlob(detail, "master_wrapped_dek"),
      );
      const rewrapped = aesEncrypt(newMasterKey, dek);
      db.prepare(
        "UPDATE details SET master_dek_iv = ?, master_dek_auth_tag = ?, master_wrapped_dek = ? WHERE project = ? AND key = ?",
      ).run(
        rewrapped.iv,
        rewrapped.authTag,
        rewrapped.ciphertext,
        requireString(detail, "project"),
        requireString(detail, "key"),
      );
    }

    // Invalidate all sessions (they hold the old master key)
    db.prepare("DELETE FROM sessions").run();

    db.exec("RELEASE change_password");
  } catch (error) {
    db.exec("ROLLBACK TO change_password");
    db.exec("RELEASE change_password");
    throw error;
  }
}

export { openVault, initVault, getMasterKey, changePassword };
