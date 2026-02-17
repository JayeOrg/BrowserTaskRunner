import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { KEY_LENGTH, aesEncrypt, decryptFrom, SESSION_COLS } from "../crypto.js";
import { requireNumber } from "../rows.js";

const SESSION_ID_LENGTH = 16;
export const SESSION_TOKEN_LENGTH = SESSION_ID_LENGTH + KEY_LENGTH;
export const DEFAULT_SESSION_MINUTES = 30;

function parseSessionToken(token: string): { sessionId: Buffer; sessionKey: Buffer } {
  const buf = Buffer.from(token, "base64");
  if (buf.length !== SESSION_TOKEN_LENGTH) {
    throw new Error(
      `Invalid session token — expected ${SESSION_TOKEN_LENGTH.toString()} bytes, got ${buf.length.toString()}`,
    );
  }
  return {
    sessionId: buf.subarray(0, SESSION_ID_LENGTH),
    sessionKey: buf.subarray(SESSION_ID_LENGTH),
  };
}

function pruneExpiredSessions(db: DatabaseSync): void {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

function createSession(db: DatabaseSync, masterKey: Buffer, durationMinutes?: number): string {
  const minutes = durationMinutes ?? DEFAULT_SESSION_MINUTES;
  const sessionId = randomBytes(SESSION_ID_LENGTH);
  const sessionKey = randomBytes(KEY_LENGTH);

  const wrapped = aesEncrypt(sessionKey, masterKey);
  const expiresAt = Date.now() + minutes * 60 * 1000;

  pruneExpiredSessions(db);

  db.prepare(
    "INSERT INTO sessions (id, iv, auth_tag, ciphertext, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(sessionId, wrapped.iv, wrapped.authTag, wrapped.ciphertext, expiresAt);

  return Buffer.concat([sessionId, sessionKey]).toString("base64");
}

function getMasterKeyFromSession(db: DatabaseSync, token: string): Buffer {
  const { sessionId, sessionKey } = parseSessionToken(token);

  const row = db
    .prepare("SELECT iv, auth_tag, ciphertext, expires_at FROM sessions WHERE id = ?")
    .get(sessionId);
  if (!row) throw new Error("Admin session not found");

  const expiresAt = requireNumber(row, "expires_at");
  if (Date.now() > expiresAt) {
    throw new Error("Admin session expired");
  }

  try {
    return decryptFrom(sessionKey, row, SESSION_COLS);
  } catch {
    throw new Error("Admin session decryption failed — invalid token");
  }
}

function getSessionExpiry(db: DatabaseSync, token: string): number | null {
  let sessionId: Buffer;
  try {
    ({ sessionId } = parseSessionToken(token));
  } catch {
    return null;
  }

  const row = db.prepare("SELECT expires_at FROM sessions WHERE id = ?").get(sessionId);
  if (!row) return null;

  const expiresAt = row.expires_at;
  if (typeof expiresAt !== "number") return null;
  return expiresAt;
}

function deleteSession(db: DatabaseSync, token: string): void {
  const { sessionId } = parseSessionToken(token);
  const result = db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  if (result.changes === 0) {
    throw new Error("Admin session not found");
  }
}

export {
  pruneExpiredSessions,
  createSession,
  getMasterKeyFromSession,
  getSessionExpiry,
  deleteSession,
};
