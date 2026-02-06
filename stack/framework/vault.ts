import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { z } from "zod";

type VaultData = Record<string, Record<string, string>>;

const vaultDataSchema = z.record(z.string(), z.record(z.string(), z.string()));

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, {
    cost: 16384,
    blockSize: 8,
    parallelization: 1,
  });
}

function encrypt(data: VaultData, password: string): Buffer {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

function decrypt(raw: Buffer, password: string): VaultData {
  const headerLength = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  if (raw.length < headerLength + 1) {
    throw new Error("Vault file is corrupted or empty");
  }

  const salt = raw.subarray(0, SALT_LENGTH);
  const iv = raw.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = raw.subarray(SALT_LENGTH + IV_LENGTH, headerLength);
  const ciphertext = raw.subarray(headerLength);

  const key = deriveKey(password, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted: string;
  try {
    const updated = decipher.update(ciphertext).toString("utf8");
    decrypted = updated + decipher.final("utf8");
  } catch {
    throw new Error("Vault decryption failed — wrong password or corrupted file");
  }

  const parsed: unknown = JSON.parse(decrypted);
  return vaultDataSchema.parse(parsed);
}

function loadVault(vaultPath: string, password: string): VaultData {
  if (!existsSync(vaultPath)) {
    return {};
  }
  const raw = readFileSync(vaultPath);
  return decrypt(raw, password);
}

function saveVault(vaultPath: string, password: string, data: VaultData): void {
  const encrypted = encrypt(data, password);
  writeFileSync(vaultPath, encrypted);
}

function getTaskSecrets(data: VaultData, taskName: string): Record<string, string> {
  return data[taskName] ?? {};
}

export { loadVault, saveVault, getTaskSecrets };
export type { VaultData };
