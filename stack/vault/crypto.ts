import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// ── Constants ──

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
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
  IV_LENGTH,
  PASSWORD_CHECK_MAGIC,
  type EncryptedParts,
  deriveKey,
  aesEncrypt,
  aesDecrypt,
  exportToken,
  parseToken,
};
