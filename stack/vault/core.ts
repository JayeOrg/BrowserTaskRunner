import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import {
  SALT_LENGTH,
  PASSWORD_CHECK_MAGIC,
  deriveKey,
  aesEncrypt,
  aesDecrypt,
  packBlob,
  unpackBlob,
  decryptFrom,
  PROJECT_KEY_COLS,
  MASTER_DEK_COLS,
} from "./crypto.js";
import { requireBlob, requireString } from "./rows.js";
import { withSavepoint } from "./db.js";
import { SCHEMA } from "./schema.js";

function openVault(path: string): DatabaseSync {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path);
  } catch (cause) {
    return wrapVaultOpenError(cause, path);
  }
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

function wrapVaultOpenError(cause: unknown, path: string): never {
  const code =
    cause !== null && typeof cause === "object" && "code" in cause ? String(cause.code) : undefined;
  if (code === "ENOENT" || code === "SQLITE_CANTOPEN") {
    throw new Error(`Vault not found at ${path}. Run 'npm run vault -- init' to create one.`, {
      cause,
    });
  }
  throw cause;
}

function openVaultReadOnly(path: string): DatabaseSync {
  try {
    return new DatabaseSync(path, { readOnly: true });
  } catch (cause) {
    return wrapVaultOpenError(cause, path);
  }
}

function initVault(db: DatabaseSync, password: string): void {
  const existing = db.prepare("SELECT value FROM config WHERE key = ?").get("salt");
  if (existing) {
    throw new Error("Vault is already initialized");
  }

  const salt = randomBytes(SALT_LENGTH);
  const masterKey = deriveKey(password, salt);

  const encrypted = aesEncrypt(masterKey, Buffer.from(PASSWORD_CHECK_MAGIC, "utf8"));
  const checkBlob = packBlob(encrypted);

  withSavepoint(db, "init_vault", () => {
    db.prepare("INSERT INTO config (key, value) VALUES (?, ?)").run("salt", salt);
    db.prepare("INSERT INTO config (key, value) VALUES (?, ?)").run("password_check", checkBlob);
  });
}

function verifyPassword(db: DatabaseSync, masterKey: Buffer): void {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get("password_check");
  if (!row) throw new Error("Vault corrupted — missing password check");
  const { iv, authTag, ciphertext } = unpackBlob(requireBlob(row, "value"));

  let decrypted: Buffer;
  try {
    decrypted = aesDecrypt(masterKey, iv, authTag, ciphertext);
  } catch (cause) {
    throw new Error("Vault decryption failed — wrong password (GCM auth tag mismatch)", { cause });
  }

  if (decrypted.toString("utf8") !== PASSWORD_CHECK_MAGIC) {
    throw new Error("Vault decryption failed — data corrupted (magic string mismatch)");
  }
}

function deriveMasterKeyWithSalt(
  db: DatabaseSync,
  password: string,
): { masterKey: Buffer; salt: Buffer } {
  const saltRow = db.prepare("SELECT value FROM config WHERE key = ?").get("salt");
  if (!saltRow) throw new Error("Vault not initialized. Run 'npm run vault -- init' first.");
  const salt = requireBlob(saltRow, "value");

  const masterKey = deriveKey(password, salt);
  verifyPassword(db, masterKey);
  return { masterKey, salt };
}

function deriveMasterKey(db: DatabaseSync, password: string): Buffer {
  return deriveMasterKeyWithSalt(db, password).masterKey;
}

function changePassword(db: DatabaseSync, oldPassword: string, newPassword: string): void {
  const { masterKey: oldMasterKey } = deriveMasterKeyWithSalt(db, oldPassword);

  const newSalt = randomBytes(SALT_LENGTH);
  const newMasterKey = deriveKey(newPassword, newSalt);
  const newCheckBlob = packBlob(
    aesEncrypt(newMasterKey, Buffer.from(PASSWORD_CHECK_MAGIC, "utf8")),
  );

  withSavepoint(db, "change_password", () => {
    db.prepare("UPDATE config SET value = ? WHERE key = ?").run(newSalt, "salt");
    db.prepare("UPDATE config SET value = ? WHERE key = ?").run(newCheckBlob, "password_check");

    const projects = db
      .prepare("SELECT name, key_iv, key_auth_tag, key_ciphertext FROM projects")
      .all();
    for (const project of projects) {
      const projectKey = decryptFrom(oldMasterKey, project, PROJECT_KEY_COLS);
      const wrapped = aesEncrypt(newMasterKey, projectKey);
      db.prepare(
        "UPDATE projects SET key_iv = ?, key_auth_tag = ?, key_ciphertext = ? WHERE name = ?",
      ).run(wrapped.iv, wrapped.authTag, wrapped.ciphertext, requireString(project, "name"));
    }

    const details = db
      .prepare(
        "SELECT key, project, master_dek_iv, master_dek_auth_tag, master_dek_ciphertext FROM details",
      )
      .all();
    for (const detail of details) {
      const dek = decryptFrom(oldMasterKey, detail, MASTER_DEK_COLS);
      const rewrapped = aesEncrypt(newMasterKey, dek);
      db.prepare(
        "UPDATE details SET master_dek_iv = ?, master_dek_auth_tag = ?, master_dek_ciphertext = ? WHERE project = ? AND key = ?",
      ).run(
        rewrapped.iv,
        rewrapped.authTag,
        rewrapped.ciphertext,
        requireString(detail, "project"),
        requireString(detail, "key"),
      );
    }

    // Sessions are encrypted with the old key — undecryptable after password change.
    db.prepare("DELETE FROM sessions").run();
  });
}

export {
  openVault,
  openVaultReadOnly,
  wrapVaultOpenError,
  initVault,
  deriveMasterKey,
  changePassword,
};
