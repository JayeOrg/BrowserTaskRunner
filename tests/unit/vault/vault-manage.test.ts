import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const PASSWORD = "test-cli-password";
const CLI_PATH = join(import.meta.dirname, "../../../dist/vault/cli/main.js");

// Template vault created once in beforeAll, copied per test
let templateDir: string;
let templateVaultPath: string;
let templateToken: string;

// Per-test paths
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
    extraLines?: string[];
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
  if (options?.extraLines) {
    lines.push(...options.extraLines);
  }
  const input = lines.length > 0 ? lines.map((line) => `${line}\n`).join("") : "";
  const result = spawnSync("node", [CLI_PATH, ...args], {
    encoding: "utf8",
    env,
    input,
  });
  if (!options?.expectFailure && result.status !== 0) {
    throw new Error(
      `vault-manage ${args.join(" ")} failed (exit ${String(result.status)}):\n${result.stderr}\n${result.stdout}`,
    );
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status ?? 1,
  };
}

// Create a template vault once (2 scrypt calls) — all tests copy from this
beforeAll(() => {
  templateDir = mkdtempSync(join(tmpdir(), "vault-cli-template-"));
  templateVaultPath = join(templateDir, "vault.db");
  const templateEnvPath = join(templateDir, ".env");

  const initResult = spawnSync("node", [CLI_PATH, "init"], {
    encoding: "utf8",
    env: {
      ...process.env,
      VAULT_PATH: templateVaultPath,
      ENV_PATH: templateEnvPath,
      DOTENV_CONFIG_PATH: templateEnvPath,
      NODE_OPTIONS: "--disable-warning=ExperimentalWarning",
    },
    input: `${PASSWORD}\n${PASSWORD}\n`,
  });
  if (initResult.status !== 0) {
    throw new Error(`vault init failed (exit ${String(initResult.status)}):\n${initResult.stderr}`);
  }

  const loginResult = spawnSync("node", [CLI_PATH, "login", "--duration", "120"], {
    encoding: "utf8",
    env: {
      ...process.env,
      VAULT_PATH: templateVaultPath,
      ENV_PATH: templateEnvPath,
      DOTENV_CONFIG_PATH: templateEnvPath,
      NODE_OPTIONS: "--disable-warning=ExperimentalWarning",
    },
    input: `${PASSWORD}\n`,
  });
  if (loginResult.status !== 0) {
    throw new Error(
      `vault login failed (exit ${String(loginResult.status)}):\n${loginResult.stderr}`,
    );
  }

  const envContent = readFileSync(templateEnvPath, "utf8");
  const match = /^VAULT_ADMIN=(?<token>.+)$/mu.exec(envContent);
  if (!match?.groups?.token) throw new Error("Template VAULT_ADMIN not found in .env");
  templateToken = match.groups.token;
});

afterAll(() => {
  rmSync(templateDir, { recursive: true, force: true });
});

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "vault-cli-test-"));
  vaultPath = join(tempDir, "vault.db");
  envPath = join(tempDir, ".env");
  copyFileSync(templateVaultPath, vaultPath);
  // Write clean .env (no VAULT_ADMIN) — tests opt in to token via adminToken option
  writeFileSync(envPath, "", "utf8");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function readAdminToken(): string {
  const content = readFileSync(envPath, "utf8");
  const result = /^VAULT_ADMIN=(?<token>.+)$/mu.exec(content);
  if (!result?.groups?.token) throw new Error("VAULT_ADMIN not found in .env");
  return result.groups.token;
}

const TOKEN = () => ({ adminToken: templateToken, password: "" });

describe("vault CLI", () => {
  it("initializes a new vault", () => {
    const freshPath = join(tempDir, "fresh.db");
    const result = run(["init"], { vaultPathOverride: freshPath, extraLines: [PASSWORD] });
    expect(result.stdout).toContain("initialized");
  });

  it("sets and gets a detail", () => {
    run(["project", "create", "proj"], TOKEN());
    run(["detail", "set", "proj", "my-email"], { ...TOKEN(), secretValue: "hello@test.com" });
    const result = run(["detail", "get", "proj", "my-email"], TOKEN());
    expect(result.stdout.trim()).toBe("hello@test.com");
  });

  it("lists details with header", () => {
    run(["project", "create", "proj"], TOKEN());
    run(["detail", "set", "proj", "a-key"], { ...TOKEN(), secretValue: "val1" });
    run(["detail", "set", "proj", "b-key"], { ...TOKEN(), secretValue: "val2" });
    const result = run(["detail", "list"], TOKEN());
    expect(result.stdout).toContain("Details:");
    expect(result.stdout).toContain("a-key");
    expect(result.stdout).toContain("b-key");
  });

  it("lists details filtered by project omits project name", () => {
    run(["project", "create", "proj-a"], TOKEN());
    run(["project", "create", "proj-b"], TOKEN());
    run(["detail", "set", "proj-a", "a-key"], { ...TOKEN(), secretValue: "val1" });
    run(["detail", "set", "proj-b", "b-key"], { ...TOKEN(), secretValue: "val2" });
    const result = run(["detail", "list", "proj-a"], TOKEN());
    expect(result.stdout).toContain('Details in "proj-a":');
    expect(result.stdout).toContain("a-key");
    expect(result.stdout).not.toContain("b-key");
  });

  it("removes a detail", () => {
    run(["project", "create", "proj"], TOKEN());
    run(["detail", "set", "proj", "doomed"], { ...TOKEN(), secretValue: "val" });
    run(["detail", "remove", "proj", "doomed"], TOKEN());
    const result = run(["detail", "list", "proj"], TOKEN());
    expect(result.stdout).toContain("No details");
  });

  it("overwrites an existing detail", () => {
    run(["project", "create", "proj"], TOKEN());
    run(["detail", "set", "proj", "my-email"], { ...TOKEN(), secretValue: "old@test.com" });
    run(["detail", "set", "proj", "my-email"], { ...TOKEN(), secretValue: "new@test.com" });
    const result = run(["detail", "get", "proj", "my-email"], TOKEN());
    expect(result.stdout.trim()).toBe("new@test.com");
  });

  it("init rejects mismatched confirmation in pipe mode", () => {
    const freshPath = join(tempDir, "mismatch.db");
    const result = run(["init"], {
      vaultPathOverride: freshPath,
      extraLines: ["wrong-confirm"],
      expectFailure: true,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Passwords do not match");
  });

  it("creates a project and shows token", () => {
    const result = run(["project", "create", "test-proj"], TOKEN());
    expect(result.stderr).toContain("test-proj");
    expect(result.stdout.trim()).toMatch(/^[A-Za-z0-9+/=]+$/u);
  });

  it("project create --write-env writes token to .env", () => {
    run(["project", "create", "write-test", "--write-env"], TOKEN());
    const content = readFileSync(envPath, "utf8");
    expect(content).toContain("VAULT_TOKEN_WRITE_TEST=");
  });

  it("lists projects with header", () => {
    run(["project", "create", "alpha"], TOKEN());
    run(["project", "create", "beta"], TOKEN());
    const result = run(["project", "list"], TOKEN());
    expect(result.stdout).toContain("Projects:");
    expect(result.stdout).toContain("alpha");
    expect(result.stdout).toContain("beta");
  });

  it("fails with wrong password on detail get", () => {
    run(["project", "create", "proj"], TOKEN());
    run(["detail", "set", "proj", "my-key"], { ...TOKEN(), secretValue: "val" });

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
    const detailResult = run(["detail", "list"], TOKEN());
    expect(detailResult.stdout).toContain("No details");

    const projectResult = run(["project", "list"], TOKEN());
    expect(projectResult.stdout).toContain("No projects");
  });
});

describe("vault login/logout", () => {
  it("login creates a session and writes token to .env", () => {
    const result = run(["login"]);
    expect(result.stdout).toContain("Session active for 30 minutes");
    expect(result.stdout).toContain("Token written to .env");

    const token = readAdminToken();
    expect(token.length).toBeGreaterThan(0);
  });

  it("login accepts custom duration", () => {
    const result = run(["login", "--duration", "60"]);
    expect(result.stdout).toContain("60 minutes");
  });

  it("session token works for admin commands", () => {
    run(["login"]);
    const token = readAdminToken();

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
    expect(result.stdout).toContain("No active session");
  });

  it("status shows active session with time remaining", () => {
    run(["login"]);
    const token = readAdminToken();
    const result = run(["status"], { adminToken: token, password: "" });
    expect(result.stdout).toContain("Session active");
    expect(result.stdout).toContain("min remaining");
  });

  it("status shows no session when not logged in", () => {
    const result = run(["status"], { password: "" });
    expect(result.stdout).toContain("No active session");
  });
});

describe("detail set value prompting", () => {
  it("reads value from stdin, not CLI args", () => {
    run(["project", "create", "proj"], TOKEN());
    run(["detail", "set", "proj", "secret-key"], { ...TOKEN(), secretValue: "from-stdin" });
    const result = run(["detail", "get", "proj", "secret-key"], TOKEN());
    expect(result.stdout.trim()).toBe("from-stdin");
  });

  it("fails when no value is provided on stdin", () => {
    run(["project", "create", "proj"], TOKEN());
    const result = run(["detail", "set", "proj", "k"], {
      ...TOKEN(),
      expectFailure: true,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("No value");
  });
});

describe("change-password", () => {
  it("changes the vault password", () => {
    run(["project", "create", "proj"], TOKEN());
    run(["detail", "set", "proj", "k"], { ...TOKEN(), secretValue: "secret-val" });

    // Change password: stdin = old, new, confirm
    run(["change-password"], {
      password: PASSWORD,
      secretValue: "new-password-123",
      extraLines: ["new-password-123"],
    });

    // Old password fails
    const fail = run(["detail", "get", "proj", "k"], {
      password: PASSWORD,
      expectFailure: true,
    });
    expect(fail.exitCode).not.toBe(0);

    // New password works
    const ok = run(["detail", "get", "proj", "k"], { password: "new-password-123" });
    expect(ok.stdout.trim()).toBe("secret-val");
  });

  it("rejects mismatched confirmation in pipe mode", () => {
    const result = run(["change-password"], {
      password: PASSWORD,
      secretValue: "new-pw",
      extraLines: ["wrong-confirm"],
      expectFailure: true,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Passwords do not match");
  });

  it("invalidates sessions", () => {
    run(["login"]);
    const token = readAdminToken();

    run(["change-password"], {
      password: PASSWORD,
      secretValue: "new-pw",
      extraLines: ["new-pw"],
    });

    const result = run(["project", "create", "after-change"], {
      adminToken: token,
      password: "",
      expectFailure: true,
    });
    expect(result.exitCode).not.toBe(0);
  });
});

describe("project remove", () => {
  it("removes a project and cascades its details", () => {
    run(["project", "create", "doomed"], TOKEN());
    run(["detail", "set", "doomed", "secret"], { ...TOKEN(), secretValue: "val" });

    const result = run(["project", "remove", "doomed"], TOKEN());
    expect(result.stdout).toContain('Removed project "doomed"');

    const list = run(["project", "list"], TOKEN());
    expect(list.stdout).not.toContain("doomed");

    const details = run(["detail", "list"], TOKEN());
    expect(details.stdout).not.toContain("secret");
  });

  it("fails for nonexistent project", () => {
    const result = run(["project", "remove", "nope"], {
      ...TOKEN(),
      expectFailure: true,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("nope");
  });
});

describe("project rename", () => {
  it("renames a project and preserves its details", () => {
    run(["project", "create", "old-name"], TOKEN());
    run(["detail", "set", "old-name", "email"], { ...TOKEN(), secretValue: "user@test.com" });

    const result = run(["project", "rename", "old-name", "new-name"], TOKEN());
    expect(result.stdout).toContain('Renamed project "old-name" to "new-name"');

    const list = run(["project", "list"], TOKEN());
    expect(list.stdout).toContain("new-name");
    expect(list.stdout).not.toContain("old-name");

    const detail = run(["detail", "get", "new-name", "email"], TOKEN());
    expect(detail.stdout.trim()).toBe("user@test.com");
  });

  it("fails for nonexistent project", () => {
    const result = run(["project", "rename", "nope", "new-name"], {
      ...TOKEN(),
      expectFailure: true,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("nope");
  });

  it("fails when target name already exists", () => {
    run(["project", "create", "proj-a"], TOKEN());
    run(["project", "create", "proj-b"], TOKEN());
    const result = run(["project", "rename", "proj-a", "proj-b"], {
      ...TOKEN(),
      expectFailure: true,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("already exists");
  });
});

describe("project rotate", () => {
  it("rotates the project key and outputs a new token", () => {
    const createResult = run(["project", "create", "rotating"], TOKEN());
    const oldToken = createResult.stdout.trim();
    expect(oldToken).toBeTruthy();

    run(["detail", "set", "rotating", "secret"], { ...TOKEN(), secretValue: "my-val" });

    const rotateResult = run(["project", "rotate", "rotating"], TOKEN());
    expect(rotateResult.stdout).toContain("Rotated key");
    const newToken = /Token: (?<token>.+)/u.exec(rotateResult.stdout)?.groups?.token;
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);
  });

  it("details are still accessible after rotation via admin", () => {
    run(["project", "create", "rot-proj"], TOKEN());
    run(["detail", "set", "rot-proj", "email"], { ...TOKEN(), secretValue: "user@test.com" });

    run(["project", "rotate", "rot-proj"], TOKEN());

    const result = run(["detail", "get", "rot-proj", "email"], TOKEN());
    expect(result.stdout.trim()).toBe("user@test.com");
  });

  it("fails for nonexistent project", () => {
    const result = run(["project", "rotate", "nope"], {
      ...TOKEN(),
      expectFailure: true,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("nope");
  });
});
