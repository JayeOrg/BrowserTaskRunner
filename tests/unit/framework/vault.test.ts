import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadVault, saveVault, getTaskSecrets } from "../../../stack/framework/vault.js";

// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- test fixtures
const PASSWORD = "test-password-123";

let tempDir: string;
let vaultPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "vault-test-"));
  vaultPath = join(tempDir, "vault.enc");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("loadVault", () => {
  it("returns empty object when file does not exist", () => {
    const data = loadVault(vaultPath, PASSWORD);
    expect(data).toEqual({});
  });

  it("roundtrips data through save and load", () => {
    const original = {
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- test fixture
      taskA: { SITE_EMAIL: "a@example.com", SITE_PASSWORD: "secret-a" },
      taskB: { SITE_API_KEY: "key-123" },
    };
    saveVault(vaultPath, PASSWORD, original);
    const loaded = loadVault(vaultPath, PASSWORD);
    expect(loaded).toEqual(original);
  });

  it("throws on wrong password", () => {
    saveVault(vaultPath, PASSWORD, { task: { KEY: "value" } });
    expect(() => loadVault(vaultPath, "wrong-password")).toThrow("Vault decryption failed");
  });

  it("throws on corrupted file", () => {
    writeFileSync(vaultPath, Buffer.from("not-encrypted-data"));
    expect(() => loadVault(vaultPath, PASSWORD)).toThrow();
  });

  it("throws on truncated file (too short for header)", () => {
    writeFileSync(vaultPath, Buffer.alloc(10));
    expect(() => loadVault(vaultPath, PASSWORD)).toThrow("corrupted or empty");
  });
});

describe("saveVault", () => {
  it("creates the vault file", () => {
    saveVault(vaultPath, PASSWORD, { task: { KEY: "val" } });
    expect(existsSync(vaultPath)).toBe(true);
  });

  it("overwrites existing vault with new data", () => {
    saveVault(vaultPath, PASSWORD, { task: { KEY: "old" } });
    saveVault(vaultPath, PASSWORD, { task: { KEY: "new" } });
    const loaded = loadVault(vaultPath, PASSWORD);
    expect(loaded).toEqual({ task: { KEY: "new" } });
  });

  it("produces different ciphertext on each save (random salt/iv)", () => {
    const data = { task: { KEY: "val" } };
    saveVault(vaultPath, PASSWORD, data);
    const first = readFileSync(vaultPath);
    saveVault(vaultPath, PASSWORD, data);
    const second = readFileSync(vaultPath);
    expect(Buffer.compare(first, second)).not.toBe(0);
  });
});

describe("getTaskSecrets", () => {
  it("returns secrets for a known task", () => {
    const data = {
      myTask: { SITE_EMAIL: "me@test.com", SITE_TOKEN: "tok" },
      other: { SITE_KEY: "k" },
    };
    expect(getTaskSecrets(data, "myTask")).toEqual({
      SITE_EMAIL: "me@test.com",
      SITE_TOKEN: "tok",
    });
  });

  it("returns empty object for unknown task", () => {
    const data = { myTask: { SITE_EMAIL: "me@test.com" } };
    expect(getTaskSecrets(data, "noSuchTask")).toEqual({});
  });

  it("does not leak secrets across tasks", () => {
    const data = {
      taskA: { SITE_EMAIL: "a@test.com" },
      taskB: { SITE_EMAIL: "b@test.com" },
    };
    expect(getTaskSecrets(data, "taskA")).toEqual({
      SITE_EMAIL: "a@test.com",
    });
    expect(getTaskSecrets(data, "taskB")).toEqual({
      SITE_EMAIL: "b@test.com",
    });
  });
});
