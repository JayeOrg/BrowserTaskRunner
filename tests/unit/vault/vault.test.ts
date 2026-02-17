import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { exportProjectToken, parseProjectToken, aesEncrypt } from "../../../stack/vault/crypto.js";
import {
  openVault,
  initVault,
  deriveMasterKey,
  changePassword,
} from "../../../stack/vault/core.js";
import {
  createProject,
  getProjectKey,
  listProjects,
  removeProject,
  rotateProject,
  renameProject,
} from "../../../stack/vault/ops/projects.js";
import {
  setDetail,
  getDetail,
  listDetails,
  removeDetail,
} from "../../../stack/vault/ops/details.js";
import {
  createSession,
  getMasterKeyFromSession,
  getSessionExpiry,
  deleteSession,
} from "../../../stack/vault/ops/sessions.js";
import { loadProjectDetails } from "../../../stack/vault/ops/runtime.js";
import { requireBlob, requireString } from "../../../stack/vault/rows.js";

const PASSWORD = "test-password-123";

let tempDir: string;
let vaultPath: string;
let db: DatabaseSync;
let masterKey: Buffer;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "vault-test-"));
  vaultPath = join(tempDir, "vault.db");
  db = openVault(vaultPath);
  initVault(db, PASSWORD);
  masterKey = deriveMasterKey(db, PASSWORD);
});

afterAll(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec("SAVEPOINT test_start");
});

afterEach(() => {
  db.exec("ROLLBACK TO test_start");
  db.exec("RELEASE test_start");
});

describe("initVault", () => {
  it("throws if vault is already initialized", () => {
    expect(() => {
      initVault(db, PASSWORD);
    }).toThrow("already initialized");
  });
});

describe("deriveMasterKey", () => {
  it("returns a key with correct password", () => {
    const key = deriveMasterKey(db, PASSWORD);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("throws with wrong password", () => {
    expect(() => deriveMasterKey(db, "wrong-password")).toThrow("wrong password");
  });

  it("throws when vault is not initialized", () => {
    const freshPath = join(tempDir, "fresh.db");
    const freshDb = openVault(freshPath);
    try {
      expect(() => deriveMasterKey(freshDb, PASSWORD)).toThrow("not initialized");
    } finally {
      freshDb.close();
    }
  });
});

describe("projects", () => {
  it("creates a project and returns a token string", () => {
    const token = createProject(db, masterKey, "test-project");
    expect(token).toBeTypeOf("string");
    expect(parseProjectToken(token).length).toBe(32);

    const retrieved = getProjectKey(db, masterKey, "test-project");
    expect(Buffer.compare(parseProjectToken(token), retrieved)).toBe(0);
  });

  it("throws when getting a nonexistent project", () => {
    expect(() => getProjectKey(db, masterKey, "nope")).toThrow('Project not found: "nope"');
  });

  it("lists projects", () => {
    createProject(db, masterKey, "alpha");
    createProject(db, masterKey, "beta");
    expect(listProjects(db)).toEqual(["alpha", "beta"]);
  });

  it("removes a project", () => {
    createProject(db, masterKey, "doomed");
    removeProject(db, "doomed");
    expect(listProjects(db)).toEqual([]);
  });

  it("throws when removing a nonexistent project", () => {
    expect(() => {
      removeProject(db, "nope");
    }).toThrow('Project not found: "nope"');
  });
});

describe("renameProject", () => {
  it("renames a project and moves its details", () => {
    createProject(db, masterKey, "old-name");
    setDetail(db, masterKey, "old-name", "secret", "val");

    renameProject(db, "old-name", "new-name");

    expect(listProjects(db)).toEqual(["new-name"]);
    expect(getDetail(db, masterKey, "new-name", "secret")).toBe("val");
    expect(listDetails(db, "old-name")).toEqual([]);
  });

  it("preserves project token after rename", () => {
    const token = createProject(db, masterKey, "old-name");
    setDetail(db, masterKey, "old-name", "secret", "val");

    renameProject(db, "old-name", "new-name");

    const context = loadProjectDetails(db, parseProjectToken(token), "new-name", { val: "secret" });
    expect(context).toEqual({ val: "val" });
  });

  it("throws when renaming a nonexistent project", () => {
    expect(() => {
      renameProject(db, "nope", "new");
    }).toThrow('Project not found: "nope"');
  });

  it("throws when target name already exists", () => {
    createProject(db, masterKey, "a");
    createProject(db, masterKey, "b");
    expect(() => {
      renameProject(db, "a", "b");
    }).toThrow('Project already exists: "b"');
  });
});

describe("exportProjectToken / parseProjectToken", () => {
  it("roundtrips a project key through token encoding", () => {
    const token = createProject(db, masterKey, "tok-test");
    const parsed = parseProjectToken(token);
    expect(parsed).toBeInstanceOf(Buffer);
    expect(parsed.length).toBe(32);
    expect(exportProjectToken(parsed)).toBe(token);
  });

  it("rejects invalid token length", () => {
    expect(() => parseProjectToken("dG9vc2hvcnQ=")).toThrow("Invalid token");
  });
});

describe("details", () => {
  it("sets and gets a detail", () => {
    createProject(db, masterKey, "proj");

    setDetail(db, masterKey, "proj", "my-email", "user@example.com");
    expect(getDetail(db, masterKey, "proj", "my-email")).toBe("user@example.com");
  });

  it("updates an existing detail", () => {
    createProject(db, masterKey, "proj");

    setDetail(db, masterKey, "proj", "my-email", "old@example.com");
    setDetail(db, masterKey, "proj", "my-email", "new@example.com");
    expect(getDetail(db, masterKey, "proj", "my-email")).toBe("new@example.com");
  });

  it("throws when getting a nonexistent detail", () => {
    createProject(db, masterKey, "proj");
    expect(() => getDetail(db, masterKey, "proj", "nope")).toThrow('Detail not found: "proj/nope"');
  });

  it("lists all details", () => {
    createProject(db, masterKey, "proj-a");
    createProject(db, masterKey, "proj-b");
    setDetail(db, masterKey, "proj-a", "email", "val");
    setDetail(db, masterKey, "proj-b", "email", "val");
    const all = listDetails(db);
    expect(all).toEqual([
      { key: "email", project: "proj-a" },
      { key: "email", project: "proj-b" },
    ]);
  });

  it("lists details filtered by project", () => {
    createProject(db, masterKey, "proj-a");
    createProject(db, masterKey, "proj-b");
    setDetail(db, masterKey, "proj-a", "email", "val");
    setDetail(db, masterKey, "proj-b", "email", "val");
    expect(listDetails(db, "proj-a")).toEqual([{ key: "email", project: "proj-a" }]);
  });

  it("removes a detail", () => {
    createProject(db, masterKey, "proj");
    setDetail(db, masterKey, "proj", "doomed", "val");
    removeDetail(db, "proj", "doomed");
    expect(listDetails(db, "proj")).toEqual([]);
  });

  it("throws when removing a nonexistent detail", () => {
    expect(() => {
      removeDetail(db, "proj", "nope");
    }).toThrow('Detail not found: "proj/nope"');
  });

  it("same key in different projects are independent", () => {
    createProject(db, masterKey, "proj-a");
    createProject(db, masterKey, "proj-b");

    setDetail(db, masterKey, "proj-a", "email", "a@test.com");
    setDetail(db, masterKey, "proj-b", "email", "b@test.com");

    expect(getDetail(db, masterKey, "proj-a", "email")).toBe("a@test.com");
    expect(getDetail(db, masterKey, "proj-b", "email")).toBe("b@test.com");
  });
});

describe("loadProjectDetails", () => {
  it("decrypts details using project token", () => {
    const token = createProject(db, masterKey, "runtime-proj");

    setDetail(db, masterKey, "runtime-proj", "email", "user@test.com");
    setDetail(db, masterKey, "runtime-proj", "pass", "secret123");

    const context = loadProjectDetails(db, parseProjectToken(token), "runtime-proj", {
      email: "email",
      password: "pass",
    });

    expect(context).toEqual({
      email: "user@test.com",
      password: "secret123",
    });
  });

  it("throws when detail does not exist", () => {
    const token = createProject(db, masterKey, "limited");

    expect(() =>
      loadProjectDetails(db, parseProjectToken(token), "limited", { key: "missing" }),
    ).toThrow('Detail "missing" not found in project "limited"');
  });

  it("fails with wrong project token", () => {
    const correctToken = createProject(db, masterKey, "proj-a");
    createProject(db, masterKey, "proj-b");
    setDetail(db, masterKey, "proj-a", "secret", "val");

    const wrongKey = getProjectKey(db, masterKey, "proj-b");
    expect(() => loadProjectDetails(db, wrongKey, "proj-a", { key: "secret" })).toThrow(
      "invalid project token",
    );

    const context = loadProjectDetails(db, parseProjectToken(correctToken), "proj-a", {
      key: "secret",
    });
    expect(context).toEqual({ key: "val" });
  });
});

describe("project isolation", () => {
  it("projects cannot decrypt each other's details", () => {
    const tokenA = createProject(db, masterKey, "proj-a");
    const tokenB = createProject(db, masterKey, "proj-b");

    setDetail(db, masterKey, "proj-a", "secret", "value-a");
    setDetail(db, masterKey, "proj-b", "secret", "value-b");

    expect(loadProjectDetails(db, parseProjectToken(tokenA), "proj-a", { val: "secret" })).toEqual({
      val: "value-a",
    });
    expect(loadProjectDetails(db, parseProjectToken(tokenB), "proj-b", { val: "secret" })).toEqual({
      val: "value-b",
    });

    expect(() =>
      loadProjectDetails(db, parseProjectToken(tokenA), "proj-b", { val: "secret" }),
    ).toThrow();
    expect(() =>
      loadProjectDetails(db, parseProjectToken(tokenB), "proj-a", { val: "secret" }),
    ).toThrow();
  });
});

describe("cascade deletes", () => {
  it("removing a project cascades its details", () => {
    createProject(db, masterKey, "temp-proj");
    setDetail(db, masterKey, "temp-proj", "email", "val");
    removeProject(db, "temp-proj");
    expect(listDetails(db, "temp-proj")).toEqual([]);
  });
});

describe("rotateProject", () => {
  it("rotates the key and new token works", () => {
    const oldToken = createProject(db, masterKey, "rotating");
    setDetail(db, masterKey, "rotating", "secret", "rot-value");

    const newToken = rotateProject(db, masterKey, "rotating");
    expect(oldToken).not.toBe(newToken);

    const context = loadProjectDetails(db, parseProjectToken(newToken), "rotating", {
      val: "secret",
    });
    expect(context).toEqual({ val: "rot-value" });
  });

  it("old token fails after rotation", () => {
    const oldToken = createProject(db, masterKey, "rotating2");
    setDetail(db, masterKey, "rotating2", "secret", "val");

    rotateProject(db, masterKey, "rotating2");

    expect(() =>
      loadProjectDetails(db, parseProjectToken(oldToken), "rotating2", { val: "secret" }),
    ).toThrow("invalid project token");
  });
});

describe("setDetail update", () => {
  it("updating a detail value still works via project token", () => {
    const token = createProject(db, masterKey, "rewrap");
    setDetail(db, masterKey, "rewrap", "secret", "old-value");
    setDetail(db, masterKey, "rewrap", "secret", "new-value");

    const context = loadProjectDetails(db, parseProjectToken(token), "rewrap", { val: "secret" });
    expect(context).toEqual({ val: "new-value" });
  });
});

describe("changePassword", () => {
  it("changes the password and re-wraps everything", () => {
    createProject(db, masterKey, "proj");
    setDetail(db, masterKey, "proj", "secret", "my-value");

    changePassword(db, PASSWORD, "new-password");

    // Old password fails
    expect(() => deriveMasterKey(db, PASSWORD)).toThrow("wrong password");

    // New password works
    const newMasterKey = deriveMasterKey(db, "new-password");
    expect(getDetail(db, newMasterKey, "proj", "secret")).toBe("my-value");
  });

  it("preserves project token access after password change", () => {
    const token = createProject(db, masterKey, "proj");
    setDetail(db, masterKey, "proj", "secret", "token-value");

    changePassword(db, PASSWORD, "new-password");

    const context = loadProjectDetails(db, parseProjectToken(token), "proj", { val: "secret" });
    expect(context).toEqual({ val: "token-value" });
  });

  it("invalidates admin sessions", () => {
    const token = createSession(db, masterKey);
    changePassword(db, PASSWORD, "new-password");
    expect(() => getMasterKeyFromSession(db, token)).toThrow("not found");
  });

  it("throws with wrong old password", () => {
    expect(() => {
      changePassword(db, "wrong", "new");
    }).toThrow("wrong password");
  });
});

describe("sessions", () => {
  it("creates a session and retrieves the master key", () => {
    const token = createSession(db, masterKey);
    const retrieved = getMasterKeyFromSession(db, token);
    expect(Buffer.compare(masterKey, retrieved)).toBe(0);
  });

  it("session token can perform admin operations", () => {
    const token = createSession(db, masterKey);
    const sessionMasterKey = getMasterKeyFromSession(db, token);

    createProject(db, sessionMasterKey, "session-proj");
    setDetail(db, sessionMasterKey, "session-proj", "email", "test@test.com");
    expect(getDetail(db, sessionMasterKey, "session-proj", "email")).toBe("test@test.com");
  });

  it("accepts custom duration", () => {
    const token = createSession(db, masterKey, 60);
    const retrieved = getMasterKeyFromSession(db, token);
    expect(Buffer.compare(masterKey, retrieved)).toBe(0);
  });

  it("throws on expired session", () => {
    // Create a session with negative duration (already expired)
    const token = createSession(db, masterKey, -1);
    expect(() => getMasterKeyFromSession(db, token)).toThrow("expired");
  });

  it("throws on invalid token", () => {
    expect(() => getMasterKeyFromSession(db, "dG9vc2hvcnQ=")).toThrow("Invalid session token");
  });

  it("throws on tampered token", () => {
    const token = createSession(db, masterKey);
    const buf = Buffer.from(token, "base64");
    // Corrupt the last byte in the session key portion
    buf[buf.length - 1] = 0;
    const tampered = buf.toString("base64");
    expect(() => getMasterKeyFromSession(db, tampered)).toThrow();
  });

  it("throws when session does not exist", () => {
    // Valid length but nonexistent session ID
    const fake = Buffer.alloc(48, 0).toString("base64");
    expect(() => getMasterKeyFromSession(db, fake)).toThrow("not found");
  });

  it("deletes a session", () => {
    const token = createSession(db, masterKey);
    deleteSession(db, token);
    expect(() => getMasterKeyFromSession(db, token)).toThrow("not found");
  });

  it("throws when deleting a nonexistent session", () => {
    const fake = Buffer.alloc(48, 0).toString("base64");
    expect(() => {
      deleteSession(db, fake);
    }).toThrow("not found");
  });
});

describe("getSessionExpiry", () => {
  it("returns expiry timestamp for a valid session", () => {
    const token = createSession(db, masterKey, 30);
    const expiry = getSessionExpiry(db, token);
    expect(expiry).toBeTypeOf("number");
    expect(expiry).toBeGreaterThan(Date.now());
  });

  it("returns null for invalid token length", () => {
    expect(getSessionExpiry(db, "dG9vc2hvcnQ=")).toBeNull();
  });

  it("returns null for nonexistent session", () => {
    const fake = Buffer.alloc(48, 0).toString("base64");
    expect(getSessionExpiry(db, fake)).toBeNull();
  });

  it("returns expiry even when session is expired", () => {
    const token = createSession(db, masterKey, -1);
    const expiry = getSessionExpiry(db, token);
    expect(expiry).toBeTypeOf("number");
    expect(expiry).toBeLessThan(Date.now());
  });
});

describe("session housekeeping", () => {
  it("createSession purges expired sessions", () => {
    const expiredToken = createSession(db, masterKey, -1);

    // Creating a new session triggers housekeeping
    createSession(db, masterKey, 30);

    // The expired session should have been purged
    expect(getSessionExpiry(db, expiredToken)).toBeNull();
  });
});

describe("requireBlob", () => {
  it("returns Buffer for Uint8Array values", () => {
    const row = { field: new Uint8Array([1, 2, 3]) };
    const result = requireBlob(row, "field");
    expect(result).toBeInstanceOf(Buffer);
    expect(result).toEqual(Buffer.from([1, 2, 3]));
  });

  it("throws for non-Uint8Array values", () => {
    expect(() => requireBlob({ field: "not-a-blob" }, "field")).toThrow(
      'Expected BLOB for field "field"',
    );
    expect(() => requireBlob({ field: 42 }, "field")).toThrow('Expected BLOB for field "field"');
    expect(() => requireBlob({}, "field")).toThrow('Expected BLOB for field "field"');
  });
});

describe("requireString", () => {
  it("returns string values", () => {
    expect(requireString({ name: "hello" }, "name")).toBe("hello");
  });

  it("throws for non-string values", () => {
    expect(() => requireString({ name: 42 }, "name")).toThrow('Expected TEXT for field "name"');
    expect(() => requireString({ name: null }, "name")).toThrow('Expected TEXT for field "name"');
    expect(() => requireString({}, "name")).toThrow('Expected TEXT for field "name"');
  });
});

describe("rotateProject rollback", () => {
  it("rolls back on failure mid-rotation", () => {
    createProject(db, masterKey, "rollback-rot");
    setDetail(db, masterKey, "rollback-rot", "secret", "val");

    // Corrupt a detail row so decryption fails mid-rotation
    db.prepare(
      "UPDATE details SET project_dek_iv = zeroblob(1) WHERE project = 'rollback-rot'",
    ).run();

    expect(() => rotateProject(db, masterKey, "rollback-rot")).toThrow();

    // Project should still exist (rollback preserved it)
    expect(listProjects(db)).toContain("rollback-rot");
  });
});

describe("changePassword rollback", () => {
  it("rolls back on failure mid-password-change", () => {
    createProject(db, masterKey, "rollback-pw");
    setDetail(db, masterKey, "rollback-pw", "secret", "val");

    // Corrupt a detail row so re-wrapping fails
    db.prepare(
      "UPDATE details SET master_dek_iv = zeroblob(1) WHERE project = 'rollback-pw'",
    ).run();

    expect(() => {
      changePassword(db, PASSWORD, "new-pw");
    }).toThrow();

    // Original password should still work (rollback preserved state)
    const key = deriveMasterKey(db, PASSWORD);
    expect(key).toBeInstanceOf(Buffer);
  });
});

describe("vault corruption defenses", () => {
  it("throws 'Vault corrupted' when password_check row is missing", () => {
    db.prepare("DELETE FROM config WHERE key = 'password_check'").run();
    expect(() => deriveMasterKey(db, PASSWORD)).toThrow("Vault corrupted");
  });

  it("throws when password_check decrypts to wrong magic string", () => {
    const wrongMagic = aesEncrypt(masterKey, Buffer.from("wrong-magic", "utf8"));
    const wrongBlob = Buffer.concat([wrongMagic.iv, wrongMagic.authTag, wrongMagic.ciphertext]);
    db.prepare("UPDATE config SET value = ? WHERE key = ?").run(wrongBlob, "password_check");

    expect(() => deriveMasterKey(db, PASSWORD)).toThrow("data corrupted (magic string mismatch)");
  });

  it("getProjectKey throws 'wrong master password' with wrong key", () => {
    createProject(db, masterKey, "proj");
    const fakeKey = Buffer.alloc(32, 0);
    expect(() => getProjectKey(db, fakeKey, "proj")).toThrow("master key mismatch");
  });

  it("loadProjectDetails throws 'corrupted data' when value ciphertext is corrupted", () => {
    const token = createProject(db, masterKey, "corrupt-val");
    setDetail(db, masterKey, "corrupt-val", "secret", "my-value");

    // Corrupt just the value ciphertext — DEK columns remain valid
    db.prepare(
      "UPDATE details SET value_ciphertext = zeroblob(1) WHERE project = 'corrupt-val'",
    ).run();

    expect(() =>
      loadProjectDetails(db, parseProjectToken(token), "corrupt-val", { val: "secret" }),
    ).toThrow("corrupted data");
  });

  it("deleteSession throws with invalid token length", () => {
    expect(() => {
      deleteSession(db, "dG9vc2hvcnQ=");
    }).toThrow("Invalid session token");
  });
});
