import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { loadVault } from "../../../stack/framework/vault.js";

// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- test fixtures
const PASSWORD = "test-cli-password";
const CLI_PATH = join(import.meta.dirname, "../../../dist/framework/vault-manage.js");

let tempDir: string;
let vaultPath: string;

function hasExecFields(err: unknown): err is { stdout: unknown; stderr: unknown; status: unknown } {
  return (
    err !== null && typeof err === "object" && "stdout" in err && "stderr" in err && "status" in err
  );
}

function run(
  args: string[],
  options?: { password?: string; expectFailure?: boolean },
): { stdout: string; stderr: string; exitCode: number } {
  const pw = options?.password ?? PASSWORD;
  const env = { ...process.env, VAULT_PASSWORD: pw, VAULT_PATH: vaultPath };
  try {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- test helper running node
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
      encoding: "utf8",
      env,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    if (options?.expectFailure && hasExecFields(err)) {
      return {
        stdout: String(err.stdout),
        stderr: String(err.stderr),
        exitCode: typeof err.status === "number" ? err.status : 1,
      };
    }
    throw err;
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "vault-cli-test-"));
  vaultPath = join(tempDir, "vault.enc");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("vault CLI", () => {
  it("sets and gets a secret", () => {
    run(["set", "myTask", "SITE_EMAIL", "hello@test.com"]);
    const result = run(["get", "myTask", "SITE_EMAIL"]);
    expect(result.stdout.trim()).toBe("hello@test.com");
  });

  it("lists all tasks", () => {
    run(["set", "taskA", "SITE_KEY", "val1"]);
    run(["set", "taskB", "SITE_KEY", "val2"]);
    const result = run(["list"]);
    expect(result.stdout).toContain("taskA");
    expect(result.stdout).toContain("taskB");
  });

  it("lists keys for a specific task", () => {
    run(["set", "myTask", "SITE_EMAIL", "a@b.com"]);
    run(["set", "myTask", "SITE_PASSWORD", "secret"]);
    const result = run(["list", "myTask"]);
    expect(result.stdout).toContain("SITE_EMAIL");
    expect(result.stdout).toContain("SITE_PASSWORD");
  });

  it("removes a single key", () => {
    run(["set", "myTask", "SITE_EMAIL", "a@b.com"]);
    run(["set", "myTask", "SITE_PASSWORD", "secret"]);
    run(["remove", "myTask", "SITE_EMAIL"]);
    const result = run(["list", "myTask"]);
    expect(result.stdout).not.toContain("SITE_EMAIL");
    expect(result.stdout).toContain("SITE_PASSWORD");
  });

  it("removes an entire task", () => {
    run(["set", "myTask", "SITE_KEY", "val"]);
    run(["remove", "myTask"]);
    const data = loadVault(vaultPath, PASSWORD);
    expect(data).toEqual({});
  });

  it("overwrites an existing key", () => {
    run(["set", "myTask", "SITE_EMAIL", "old@test.com"]);
    run(["set", "myTask", "SITE_EMAIL", "new@test.com"]);
    const result = run(["get", "myTask", "SITE_EMAIL"]);
    expect(result.stdout.trim()).toBe("new@test.com");
  });

  it("fails with wrong password on existing vault", () => {
    run(["set", "myTask", "SITE_KEY", "val"]);
    // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- test fixture
    const result = run(["list"], { password: "wrong", expectFailure: true });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Vault decryption failed");
  });

  it("fails when VAULT_PASSWORD is not set", () => {
    const result = run(["list"], { password: "", expectFailure: true });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("VAULT_PASSWORD");
  });

  it("shows empty vault message", () => {
    const result = run(["list"]);
    expect(result.stdout).toContain("Vault is empty");
  });
});
