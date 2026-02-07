import { DatabaseSync } from "node:sqlite";
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// ── Constants ──

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- not a password, magic string for password verification
const PASSWORD_CHECK_MAGIC = "sitecheck-vault-v1";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value BLOB NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY,
    key_iv BLOB NOT NULL,
    key_auth_tag BLOB NOT NULL,
    encrypted_key BLOB NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS details (
    key TEXT NOT NULL,
    project TEXT NOT NULL REFERENCES projects(name) ON DELETE CASCADE,
    value_iv BLOB NOT NULL,
    value_auth_tag BLOB NOT NULL,
    ciphertext BLOB NOT NULL,
    master_dek_iv BLOB NOT NULL,
    master_dek_auth_tag BLOB NOT NULL,
    master_wrapped_dek BLOB NOT NULL,
    project_dek_iv BLOB NOT NULL,
    project_dek_auth_tag BLOB NOT NULL,
    project_wrapped_dek BLOB NOT NULL,
    PRIMARY KEY (project, key)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sessions (
    id BLOB PRIMARY KEY,
    session_iv BLOB NOT NULL,
    session_auth_tag BLOB NOT NULL,
    encrypted_master_key BLOB NOT NULL,
    expires_at INTEGER NOT NULL
  ) STRICT;
`;

// ── Encrypted data shape ──

interface EncryptedParts {
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

// ── Low-level crypto ──

function deriveKey(password: string, salt: Uint8Array): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, {
    cost: 16384,
    blockSize: 8,
    parallelization: 1,
  });
}

function aesEncrypt(key: Uint8Array, plaintext: Uint8Array): EncryptedParts {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv, authTag, ciphertext };
}

function aesDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  authTag: Uint8Array,
  ciphertext: Uint8Array,
): Buffer {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ── Row helpers ──

function requireBlob(row: Record<string, unknown>, field: string): Buffer {
  const val = row[field];
  if (!(val instanceof Uint8Array)) {
    throw new Error(`Expected BLOB for field "${field}"`);
  }
  return Buffer.from(val);
}

function requireString(row: Record<string, unknown>, field: string): string {
  const val = row[field];
  if (typeof val !== "string") {
    throw new Error(`Expected TEXT for field "${field}"`);
  }
  return val;
}

// ── Database ──

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

// ── Projects ──

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

function exportToken(projectKey: Buffer): string {
  return projectKey.toString("base64");
}

function parseToken(token: string): Buffer {
  const buf = Buffer.from(token, "base64");
  if (buf.length !== KEY_LENGTH) {
    throw new Error(
      `Invalid token — expected ${KEY_LENGTH.toString()} bytes, got ${buf.length.toString()}`,
    );
  }
  return buf;
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

  db.exec("BEGIN");
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

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return newProjectKey;
}

// ── Details ──

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

// ── Sessions ──

const SESSION_ID_LENGTH = 16;
const DEFAULT_SESSION_MINUTES = 30;

function createSession(db: DatabaseSync, masterKey: Buffer, durationMinutes?: number): string {
  const minutes = durationMinutes ?? DEFAULT_SESSION_MINUTES;
  const sessionId = randomBytes(SESSION_ID_LENGTH);
  const sessionKey = randomBytes(KEY_LENGTH);

  const wrapped = aesEncrypt(sessionKey, masterKey);
  const expiresAt = Date.now() + minutes * 60 * 1000;

  // Housekeeping: clean expired sessions
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());

  db.prepare(
    "INSERT INTO sessions (id, session_iv, session_auth_tag, encrypted_master_key, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(sessionId, wrapped.iv, wrapped.authTag, wrapped.ciphertext, expiresAt);

  return Buffer.concat([sessionId, sessionKey]).toString("base64");
}

function getMasterKeyFromSession(db: DatabaseSync, token: string): Buffer {
  const buf = Buffer.from(token, "base64");
  const expectedLength = SESSION_ID_LENGTH + KEY_LENGTH;
  if (buf.length !== expectedLength) {
    throw new Error(
      `Invalid admin token — expected ${expectedLength.toString()} bytes, got ${buf.length.toString()}`,
    );
  }

  const sessionId = buf.subarray(0, SESSION_ID_LENGTH);
  const sessionKey = buf.subarray(SESSION_ID_LENGTH);

  const row = db
    .prepare(
      "SELECT session_iv, session_auth_tag, encrypted_master_key, expires_at FROM sessions WHERE id = ?",
    )
    .get(sessionId);
  if (!row) throw new Error("Admin session not found");

  const expiresAt = row.expires_at;
  if (typeof expiresAt !== "number" || Date.now() > expiresAt) {
    throw new Error("Admin session expired");
  }

  try {
    return aesDecrypt(
      sessionKey,
      requireBlob(row, "session_iv"),
      requireBlob(row, "session_auth_tag"),
      requireBlob(row, "encrypted_master_key"),
    );
  } catch {
    throw new Error("Admin session decryption failed — invalid token");
  }
}

function getSessionExpiry(db: DatabaseSync, token: string): number | null {
  const buf = Buffer.from(token, "base64");
  const expectedLength = SESSION_ID_LENGTH + KEY_LENGTH;
  if (buf.length !== expectedLength) return null;

  const sessionId = buf.subarray(0, SESSION_ID_LENGTH);
  const row = db.prepare("SELECT expires_at FROM sessions WHERE id = ?").get(sessionId);
  if (!row) return null;

  const expiresAt = row.expires_at;
  if (typeof expiresAt !== "number") return null;
  return expiresAt;
}

function deleteSession(db: DatabaseSync, token: string): void {
  const buf = Buffer.from(token, "base64");
  const sessionId = buf.subarray(0, SESSION_ID_LENGTH);
  const result = db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  if (result.changes === 0) {
    throw new Error("Admin session not found");
  }
}

// ── Runtime ──

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

export {
  openVault,
  initVault,
  getMasterKey,
  createProject,
  getProjectKey,
  exportToken,
  parseToken,
  listProjects,
  removeProject,
  rotateProject,
  setDetail,
  getDetail,
  listDetails,
  removeDetail,
  loadProjectDetails,
  createSession,
  getMasterKeyFromSession,
  getSessionExpiry,
  deleteSession,
};
