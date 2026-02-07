import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { DatabaseSync } from "node:sqlite";
import {
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
  deleteSession,
} from "../../../stack/vault/vault.js";

const PASSWORD = "test-password-123";

let tempDir: string;
let vaultPath: string;
let db: DatabaseSync;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "vault-test-"));
  vaultPath = join(tempDir, "vault.db");
  db = openVault(vaultPath);
  initVault(db, PASSWORD);
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("initVault", () => {
  it("throws if vault is already initialized", () => {
    expect(() => {
      initVault(db, PASSWORD);
    }).toThrow("already initialized");
  });
});

describe("getMasterKey", () => {
  it("returns a key with correct password", () => {
    const key = getMasterKey(db, PASSWORD);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("throws with wrong password", () => {
    expect(() => getMasterKey(db, "wrong-password")).toThrow("wrong password");
  });

  it("throws when vault is not initialized", () => {
    const freshPath = join(tempDir, "fresh.db");
    const freshDb = openVault(freshPath);
    try {
      expect(() => getMasterKey(freshDb, PASSWORD)).toThrow("not initialized");
    } finally {
      freshDb.close();
    }
  });
});

describe("projects", () => {
  it("creates a project and retrieves its key", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    const projectKey = createProject(db, masterKey, "test-project");
    expect(projectKey).toBeInstanceOf(Buffer);
    expect(projectKey.length).toBe(32);

    const retrieved = getProjectKey(db, masterKey, "test-project");
    expect(Buffer.compare(projectKey, retrieved)).toBe(0);
  });

  it("throws when getting a nonexistent project", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    expect(() => getProjectKey(db, masterKey, "nope")).toThrow('Project not found: "nope"');
  });

  it("lists projects", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    createProject(db, masterKey, "alpha");
    createProject(db, masterKey, "beta");
    expect(listProjects(db)).toEqual(["alpha", "beta"]);
  });

  it("removes a project", () => {
    const masterKey = getMasterKey(db, PASSWORD);
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

describe("exportToken / parseToken", () => {
  it("roundtrips a project key through token encoding", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    const projectKey = createProject(db, masterKey, "tok-test");
    const token = exportToken(projectKey);
    const parsed = parseToken(token);
    expect(Buffer.compare(projectKey, parsed)).toBe(0);
  });

  it("rejects invalid token length", () => {
    expect(() => parseToken("dG9vc2hvcnQ=")).toThrow("Invalid token");
  });
});

describe("details", () => {
  it("sets and gets a detail", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    createProject(db, masterKey, "proj");

    setDetail(db, masterKey, "proj", "my-email", "user@example.com");
    expect(getDetail(db, masterKey, "proj", "my-email")).toBe("user@example.com");
  });

  it("updates an existing detail", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    createProject(db, masterKey, "proj");

    setDetail(db, masterKey, "proj", "my-email", "old@example.com");
    setDetail(db, masterKey, "proj", "my-email", "new@example.com");
    expect(getDetail(db, masterKey, "proj", "my-email")).toBe("new@example.com");
  });

  it("throws when getting a nonexistent detail", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    createProject(db, masterKey, "proj");
    expect(() => getDetail(db, masterKey, "proj", "nope")).toThrow('Detail not found: "proj/nope"');
  });

  it("lists all details", () => {
    const masterKey = getMasterKey(db, PASSWORD);
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
    const masterKey = getMasterKey(db, PASSWORD);
    createProject(db, masterKey, "proj-a");
    createProject(db, masterKey, "proj-b");
    setDetail(db, masterKey, "proj-a", "email", "val");
    setDetail(db, masterKey, "proj-b", "email", "val");
    expect(listDetails(db, "proj-a")).toEqual([{ key: "email", project: "proj-a" }]);
  });

  it("removes a detail", () => {
    const masterKey = getMasterKey(db, PASSWORD);
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
    const masterKey = getMasterKey(db, PASSWORD);
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
    const masterKey = getMasterKey(db, PASSWORD);
    const projectKey = createProject(db, masterKey, "runtime-proj");

    setDetail(db, masterKey, "runtime-proj", "email", "user@test.com");
    setDetail(db, masterKey, "runtime-proj", "pass", "secret123");

    const context = loadProjectDetails(db, projectKey, "runtime-proj", {
      email: "email",
      password: "pass",
    });

    expect(context).toEqual({
      email: "user@test.com",
      password: "secret123",
    });
  });

  it("throws when detail does not exist", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    const projectKey = createProject(db, masterKey, "limited");

    expect(() => loadProjectDetails(db, projectKey, "limited", { key: "missing" })).toThrow(
      'Detail "missing" not found in project "limited"',
    );
  });

  it("fails with wrong project token", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    const correctKey = createProject(db, masterKey, "proj-a");
    createProject(db, masterKey, "proj-b");
    setDetail(db, masterKey, "proj-a", "secret", "val");

    const wrongKey = getProjectKey(db, masterKey, "proj-b");
    expect(() => loadProjectDetails(db, wrongKey, "proj-a", { key: "secret" })).toThrow(
      "invalid project token",
    );

    const context = loadProjectDetails(db, correctKey, "proj-a", { key: "secret" });
    expect(context).toEqual({ key: "val" });
  });
});

describe("project isolation", () => {
  it("projects cannot decrypt each other's details", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    const keyA = createProject(db, masterKey, "proj-a");
    const keyB = createProject(db, masterKey, "proj-b");

    setDetail(db, masterKey, "proj-a", "secret", "value-a");
    setDetail(db, masterKey, "proj-b", "secret", "value-b");

    expect(loadProjectDetails(db, keyA, "proj-a", { val: "secret" })).toEqual({
      val: "value-a",
    });
    expect(loadProjectDetails(db, keyB, "proj-b", { val: "secret" })).toEqual({
      val: "value-b",
    });

    expect(() => loadProjectDetails(db, keyA, "proj-b", { val: "secret" })).toThrow();
    expect(() => loadProjectDetails(db, keyB, "proj-a", { val: "secret" })).toThrow();
  });
});

describe("cascade deletes", () => {
  it("removing a project cascades its details", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    createProject(db, masterKey, "temp-proj");
    setDetail(db, masterKey, "temp-proj", "email", "val");
    removeProject(db, "temp-proj");

    const freshDb = openVault(vaultPath);
    try {
      expect(listDetails(freshDb, "temp-proj")).toEqual([]);
    } finally {
      freshDb.close();
    }
  });
});

describe("rotateProject", () => {
  it("rotates the key and new token works", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    const oldKey = createProject(db, masterKey, "rotating");
    setDetail(db, masterKey, "rotating", "secret", "rot-value");

    const newKey = rotateProject(db, masterKey, "rotating");
    expect(Buffer.compare(oldKey, newKey)).not.toBe(0);

    const context = loadProjectDetails(db, newKey, "rotating", { val: "secret" });
    expect(context).toEqual({ val: "rot-value" });
  });

  it("old token fails after rotation", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    const oldKey = createProject(db, masterKey, "rotating2");
    setDetail(db, masterKey, "rotating2", "secret", "val");

    rotateProject(db, masterKey, "rotating2");

    expect(() => loadProjectDetails(db, oldKey, "rotating2", { val: "secret" })).toThrow(
      "invalid project token",
    );
  });
});

describe("setDetail update", () => {
  it("updating a detail value still works via project token", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    const projectKey = createProject(db, masterKey, "rewrap");
    setDetail(db, masterKey, "rewrap", "secret", "old-value");
    setDetail(db, masterKey, "rewrap", "secret", "new-value");

    const context = loadProjectDetails(db, projectKey, "rewrap", { val: "secret" });
    expect(context).toEqual({ val: "new-value" });
  });
});

describe("sessions", () => {
  it("creates a session and retrieves the master key", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    const token = createSession(db, masterKey);
    const retrieved = getMasterKeyFromSession(db, token);
    expect(Buffer.compare(masterKey, retrieved)).toBe(0);
  });

  it("session token can perform admin operations", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    const token = createSession(db, masterKey);
    const sessionMasterKey = getMasterKeyFromSession(db, token);

    createProject(db, sessionMasterKey, "session-proj");
    setDetail(db, sessionMasterKey, "session-proj", "email", "test@test.com");
    expect(getDetail(db, sessionMasterKey, "session-proj", "email")).toBe("test@test.com");
  });

  it("accepts custom duration", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    const token = createSession(db, masterKey, 60);
    const retrieved = getMasterKeyFromSession(db, token);
    expect(Buffer.compare(masterKey, retrieved)).toBe(0);
  });

  it("throws on expired session", () => {
    const masterKey = getMasterKey(db, PASSWORD);
    // Create a session with negative duration (already expired)
    const token = createSession(db, masterKey, -1);
    expect(() => getMasterKeyFromSession(db, token)).toThrow("expired");
  });

  it("throws on invalid token", () => {
    expect(() => getMasterKeyFromSession(db, "dG9vc2hvcnQ=")).toThrow("Invalid admin token");
  });

  it("throws on tampered token", () => {
    const masterKey = getMasterKey(db, PASSWORD);
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
    const masterKey = getMasterKey(db, PASSWORD);
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
