import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { requireBlob } from "./rows.js";

// ── Constants ──

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PASSWORD_CHECK_MAGIC = "sitecheck-vault-v1";

// ── Encrypted data shape ──

interface EncryptedParts {
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

// ── Low-level crypto ──

function deriveKey(password: string, salt: Uint8Array): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, {
    cost: 131072,
    blockSize: 8,
    parallelization: 1,
    maxmem: 256 * 1024 * 1024,
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

// ── Blob packing (for single-column storage in config table) ──

function packBlob(parts: EncryptedParts): Buffer {
  return Buffer.concat([parts.iv, parts.authTag, parts.ciphertext]);
}

function unpackBlob(blob: Buffer): EncryptedParts {
  return {
    iv: blob.subarray(0, IV_LENGTH),
    authTag: blob.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH),
    ciphertext: blob.subarray(IV_LENGTH + AUTH_TAG_LENGTH),
  };
}

// ── Column groups for multi-column encrypted fields ──

type EncryptedColumnNames = readonly [iv: string, authTag: string, ciphertext: string];

const PROJECT_KEY_COLS: EncryptedColumnNames = ["key_iv", "key_auth_tag", "key_ciphertext"];
const MASTER_DEK_COLS: EncryptedColumnNames = [
  "master_dek_iv",
  "master_dek_auth_tag",
  "master_dek_ciphertext",
];
const PROJECT_DEK_COLS: EncryptedColumnNames = [
  "project_dek_iv",
  "project_dek_auth_tag",
  "project_dek_ciphertext",
];
const VALUE_COLS: EncryptedColumnNames = ["value_iv", "value_auth_tag", "value_ciphertext"];
const SESSION_COLS: EncryptedColumnNames = ["iv", "auth_tag", "ciphertext"];

function decryptFrom(
  key: Buffer,
  row: Record<string, unknown>,
  cols: EncryptedColumnNames,
): Buffer {
  return aesDecrypt(
    key,
    requireBlob(row, cols[0]),
    requireBlob(row, cols[1]),
    requireBlob(row, cols[2]),
  );
}

// ── Token serialization ──

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

export {
  KEY_LENGTH,
  SALT_LENGTH,
  PASSWORD_CHECK_MAGIC,
  type EncryptedParts,
  type EncryptedColumnNames,
  deriveKey,
  aesEncrypt,
  aesDecrypt,
  packBlob,
  unpackBlob,
  decryptFrom,
  PROJECT_KEY_COLS,
  MASTER_DEK_COLS,
  PROJECT_DEK_COLS,
  VALUE_COLS,
  SESSION_COLS,
  exportToken,
  parseToken,
};
