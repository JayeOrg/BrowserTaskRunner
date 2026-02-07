import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const PASSWORD = "test-cli-password";
const CLI_PATH = join(import.meta.dirname, "../../../dist/vault/vault-manage.js");

let tempDir: string;
let vaultPath: string;
let envPath: string;

function run(
  args: string[],
  options?: {
    password?: string;
    expectFailure?: boolean;
    vaultPathOverride?: string;
    adminToken?: string;
    secretValue?: string;
  },
): { stdout: string; stderr: string; exitCode: number } {
  const pw = options?.password ?? PASSWORD;
  const env: Record<string, string | undefined> = {
    ...process.env,
    VAULT_PATH: options?.vaultPathOverride ?? vaultPath,
    ENV_PATH: envPath,
    DOTENV_CONFIG_PATH: envPath,
    NODE_OPTIONS: "--disable-warning=ExperimentalWarning",
  };
  delete env.VAULT_PASSWORD;
  delete env.VAULT_ADMIN;
  if (options?.adminToken) {
    env.VAULT_ADMIN = options.adminToken;
  }
  const lines: string[] = [];
  if (pw.length > 0) {
    lines.push(pw);
  }
  if (options?.secretValue !== undefined) {
    lines.push(options.secretValue);
  }
  const input = lines.length > 0 ? lines.map((line) => `${line}\n`).join("") : "";
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- test helper running node
  const result = spawnSync("node", [CLI_PATH, ...args], {
    encoding: "utf8",
    env,
    input,
  });
  if (!options?.expectFailure && result.status !== 0) {
    throw new Error(
      `Command failed (exit ${String(result.status)}): ${result.stderr}\n${result.stdout}`,
    );
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status ?? 1,
  };
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "vault-cli-test-"));
  vaultPath = join(tempDir, "vault.db");
  envPath = join(tempDir, ".env");
  run(["init"]);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("vault CLI", () => {
  it("initializes a new vault", () => {
    const freshPath = join(tempDir, "fresh.db");
    const result = run(["init"], { vaultPathOverride: freshPath });
    expect(result.stdout).toContain("initialized");
  });

  it("sets and gets a detail", () => {
    run(["project", "create", "proj"]);
    run(["detail", "set", "proj", "my-email"], { secretValue: "hello@test.com" });
    const result = run(["detail", "get", "proj", "my-email"]);
    expect(result.stdout.trim()).toBe("hello@test.com");
  });

  it("lists details", () => {
    run(["project", "create", "proj"]);
    run(["detail", "set", "proj", "a-key"], { secretValue: "val1" });
    run(["detail", "set", "proj", "b-key"], { secretValue: "val2" });
    const result = run(["detail", "list"]);
    expect(result.stdout).toContain("a-key");
    expect(result.stdout).toContain("b-key");
  });

  it("lists details filtered by project", () => {
    run(["project", "create", "proj-a"]);
    run(["project", "create", "proj-b"]);
    run(["detail", "set", "proj-a", "a-key"], { secretValue: "val1" });
    run(["detail", "set", "proj-b", "b-key"], { secretValue: "val2" });
    const result = run(["detail", "list", "proj-a"]);
    expect(result.stdout).toContain("a-key");
    expect(result.stdout).not.toContain("b-key");
  });

  it("removes a detail", () => {
    run(["project", "create", "proj"]);
    run(["detail", "set", "proj", "doomed"], { secretValue: "val" });
    run(["detail", "remove", "proj", "doomed"]);
    const result = run(["detail", "list", "proj"]);
    expect(result.stdout).toContain("No details");
  });

  it("overwrites an existing detail", () => {
    run(["project", "create", "proj"]);
    run(["detail", "set", "proj", "my-email"], { secretValue: "old@test.com" });
    run(["detail", "set", "proj", "my-email"], { secretValue: "new@test.com" });
    const result = run(["detail", "get", "proj", "my-email"]);
    expect(result.stdout.trim()).toBe("new@test.com");
  });

  it("creates a project and shows token", () => {
    const result = run(["project", "create", "test-proj"]);
    expect(result.stdout).toContain("test-proj");
    expect(result.stdout).toContain("Token:");
  });

  it("lists projects", () => {
    run(["project", "create", "alpha"]);
    run(["project", "create", "beta"]);
    const result = run(["project", "list"]);
    expect(result.stdout).toContain("alpha");
    expect(result.stdout).toContain("beta");
  });

  it("fails with wrong password on detail get", () => {
    run(["project", "create", "proj"]);
    run(["detail", "set", "proj", "my-key"], { secretValue: "val" });

    const result = run(["detail", "get", "proj", "my-key"], {
      password: "wrong",
      expectFailure: true,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("wrong password");
  });

  it("fails when no password is provided on stdin", () => {
    const result = run(["detail", "set", "proj", "k"], {
      password: "",
      expectFailure: true,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("No password");
  });

  it("shows empty state messages", () => {
    const detailResult = run(["detail", "list"]);
    expect(detailResult.stdout).toContain("No details");

    const projectResult = run(["project", "list"]);
    expect(projectResult.stdout).toContain("No projects");
  });
});

function readAdminToken(): string {
  const content = readFileSync(envPath, "utf8");
  const result = /^VAULT_ADMIN=(?<token>.+)$/mu.exec(content);
  if (!result?.groups?.token) throw new Error("VAULT_ADMIN not found in .env");
  return result.groups.token;
}

describe("vault login/logout", () => {
  it("login creates a session and writes token to .env", () => {
    const result = run(["login"]);
    expect(result.stdout).toContain("Admin session active for 30 minutes");
    expect(result.stdout).toContain("Token written to .env");

    const token = readAdminToken();
    expect(token.length).toBeGreaterThan(0);
  });

  it("login accepts custom duration", () => {
    const result = run(["login", "--duration", "60"]);
    expect(result.stdout).toContain("60 minutes");
  });

  it("admin commands work with session token", () => {
    run(["login"]);
    const token = readAdminToken();

    // Use admin token instead of password for subsequent commands
    run(["project", "create", "session-proj"], { adminToken: token, password: "" });
    run(["detail", "set", "session-proj", "email"], {
      adminToken: token,
      password: "",
      secretValue: "admin@test.com",
    });
    const result = run(["detail", "get", "session-proj", "email"], {
      adminToken: token,
      password: "",
    });
    expect(result.stdout.trim()).toBe("admin@test.com");
  });

  it("logout invalidates the session and cleans .env", () => {
    run(["login"]);
    const token = readAdminToken();

    run(["logout"], { adminToken: token, password: "" });

    // Env file should no longer contain VAULT_ADMIN
    const content = readFileSync(envPath, "utf8");
    expect(content).not.toContain("VAULT_ADMIN");

    // Old token should fail on a protected command
    const protectedResult = run(["project", "create", "after-logout"], {
      adminToken: token,
      password: "",
      expectFailure: true,
    });
    expect(protectedResult.exitCode).not.toBe(0);
  });

  it("logout with no active session prints message", () => {
    const result = run(["logout"], { password: "" });
    expect(result.stdout).toContain("No active admin session");
  });

  it("status shows active session with time remaining", () => {
    run(["login"]);
    const token = readAdminToken();
    const result = run(["status"], { adminToken: token, password: "" });
    expect(result.stdout).toContain("Admin session active");
    expect(result.stdout).toContain("minutes");
  });

  it("status shows no session when not logged in", () => {
    const result = run(["status"], { password: "" });
    expect(result.stdout).toContain("No active admin session");
  });
});

describe("detail set value prompting", () => {
  it("reads value from stdin, not CLI args", () => {
    run(["project", "create", "proj"]);
    run(["detail", "set", "proj", "secret-key"], { secretValue: "from-stdin" });
    const result = run(["detail", "get", "proj", "secret-key"]);
    expect(result.stdout.trim()).toBe("from-stdin");
  });

  it("fails when no value is provided on stdin", () => {
    run(["project", "create", "proj"]);
    run(["login"]);
    const token = readAdminToken();
    const result = run(["detail", "set", "proj", "k"], {
      adminToken: token,
      password: "",
      expectFailure: true,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("No value");
  });
});
