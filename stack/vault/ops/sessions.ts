import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { KEY_LENGTH, aesEncrypt, aesDecrypt } from "../crypto.js";
import { requireBlob } from "../rows.js";

const SESSION_ID_LENGTH = 16;
export const DEFAULT_SESSION_MINUTES = 30;

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
  // Unreachable typeof branch: sessions table uses STRICT mode with `expires_at INTEGER NOT NULL`,
  // So SQLite rejects non-integer writes at the DB level. Kept for defense-in-depth.
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
  // Unreachable: sessions table STRICT mode guarantees expires_at is INTEGER. Defense-in-depth.
  if (typeof expiresAt !== "number") return null;
  return expiresAt;
}

function deleteSession(db: DatabaseSync, token: string): void {
  const buf = Buffer.from(token, "base64");
  const expectedLength = SESSION_ID_LENGTH + KEY_LENGTH;
  if (buf.length !== expectedLength) {
    throw new Error(
      `Invalid admin token — expected ${expectedLength.toString()} bytes, got ${buf.length.toString()}`,
    );
  }
  const sessionId = buf.subarray(0, SESSION_ID_LENGTH);
  const result = db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  if (result.changes === 0) {
    throw new Error("Admin session not found");
  }
}

export { createSession, getMasterKeyFromSession, getSessionExpiry, deleteSession };
