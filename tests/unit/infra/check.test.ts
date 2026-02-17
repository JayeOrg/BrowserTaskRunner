import { describe, it, expect } from "vitest";
import {
  parseArgs,
  hasVaultToken,
  computeSourceHash,
  computeSourceHashFromGit,
  buildComposeArgs,
} from "../../../stack/infra/check-args.js";

describe("parseArgs", () => {
  it("parses a bare task name", () => {
    const opts = parseArgs(["botcLogin"]);
    expect(opts.taskName).toBe("botcLogin");
    expect(opts.help).toBe(false);
    expect(opts.detach).toBe(false);
  });

  it("parses --help flag", () => {
    const opts = parseArgs(["--help"]);
    expect(opts.help).toBe(true);
  });

  it("parses -h shorthand", () => {
    const opts = parseArgs(["-h"]);
    expect(opts.help).toBe(true);
  });

  it("parses --detach flag", () => {
    const opts = parseArgs(["botcLogin", "--detach"]);
    expect(opts.detach).toBe(true);
  });

  it("parses -d shorthand", () => {
    const opts = parseArgs(["botcLogin", "-d"]);
    expect(opts.detach).toBe(true);
  });

  it("parses --dry-run flag", () => {
    const opts = parseArgs(["botcLogin", "--dry-run"]);
    expect(opts.dryRun).toBe(true);
  });

  it("parses --no-vnc flag", () => {
    const opts = parseArgs(["botcLogin", "--no-vnc"]);
    expect(opts.noVnc).toBe(true);
  });

  it("parses --no-build flag", () => {
    const opts = parseArgs(["botcLogin", "--no-build"]);
    expect(opts.noBuild).toBe(true);
  });

  it("parses --rebuild flag", () => {
    const opts = parseArgs(["botcLogin", "--rebuild"]);
    expect(opts.rebuild).toBe(true);
  });

  it("parses --persist-profile flag", () => {
    const opts = parseArgs(["botcLogin", "--persist-profile"]);
    expect(opts.persistProfile).toBe(true);
  });

  it("parses multiple flags together", () => {
    const opts = parseArgs(["botcLogin", "--detach", "--no-vnc", "--dry-run"]);
    expect(opts.taskName).toBe("botcLogin");
    expect(opts.detach).toBe(true);
    expect(opts.noVnc).toBe(true);
    expect(opts.dryRun).toBe(true);
    expect(opts.rebuild).toBe(false);
  });

  it("uses the first positional arg as task name, ignores subsequent", () => {
    const opts = parseArgs(["first", "second"]);
    expect(opts.taskName).toBe("first");
  });

  it("throws on unknown option", () => {
    expect(() => parseArgs(["--bogus"])).toThrow("Unknown option: --bogus");
  });

  it("throws on unknown short option", () => {
    expect(() => parseArgs(["-z"])).toThrow("Unknown option: -z");
  });

  it("returns empty taskName when no positional arg given", () => {
    const opts = parseArgs([]);
    expect(opts.taskName).toBe("");
  });

  it("allows flags before the task name", () => {
    const opts = parseArgs(["--detach", "myTask"]);
    expect(opts.taskName).toBe("myTask");
    expect(opts.detach).toBe(true);
  });
});

describe("hasVaultToken", () => {
  it("matches project-scoped token", () => {
    expect(hasVaultToken("VAULT_TOKEN_NANDOS=abc123")).toBe(true);
  });

  it("matches legacy fallback token", () => {
    expect(hasVaultToken("VAULT_TOKEN=abc123")).toBe(true);
  });

  it("matches token among other env vars", () => {
    const env = "FOO=bar\nVAULT_TOKEN_BOTC=secret\nBAZ=qux";
    expect(hasVaultToken(env)).toBe(true);
  });

  it("rejects empty file", () => {
    expect(hasVaultToken("")).toBe(false);
  });

  it("rejects token with no value", () => {
    expect(hasVaultToken("VAULT_TOKEN=")).toBe(false);
  });

  it("rejects project token with no value", () => {
    expect(hasVaultToken("VAULT_TOKEN_NANDOS=")).toBe(false);
  });

  it("rejects unrelated vars", () => {
    expect(hasVaultToken("OTHER_TOKEN=abc123\nFOO=bar")).toBe(false);
  });

  it("rejects partial prefix match", () => {
    expect(hasVaultToken("MY_VAULT_TOKEN=abc")).toBe(false);
  });
});

describe("computeSourceHash", () => {
  it("produces a 12-character hex string", () => {
    const hash = computeSourceHash("some git output");
    expect(hash).toMatch(/^[\da-f]{12}$/u);
  });

  it("is deterministic for the same input", () => {
    const hash1 = computeSourceHash("identical input");
    const hash2 = computeSourceHash("identical input");
    expect(hash1).toBe(hash2);
  });

  it("differs for different inputs", () => {
    const hash1 = computeSourceHash("input a");
    const hash2 = computeSourceHash("input b");
    expect(hash1).not.toBe(hash2);
  });
});

describe("computeSourceHashFromGit", () => {
  it("returns a 12-character hex hash in a git repo", () => {
    const hash = computeSourceHashFromGit();
    expect(hash).toMatch(/^[\da-f]{12}$/u);
  });

  it("is deterministic across calls", () => {
    const hash1 = computeSourceHashFromGit();
    const hash2 = computeSourceHashFromGit();
    expect(hash1).toBe(hash2);
  });
});

describe("buildComposeArgs", () => {
  const COMPOSE = "stack/infra/docker-compose.yml";

  function defaults(): Parameters<typeof buildComposeArgs>[0] {
    return {
      taskName: "test",
      help: false,
      detach: false,
      dryRun: false,
      noVnc: false,
      noBuild: false,
      rebuild: false,
      persistProfile: false,
    };
  }

  it("includes --build by default", () => {
    const args = buildComposeArgs(defaults(), COMPOSE);
    expect(args).toEqual(["compose", "-f", COMPOSE, "--env-file", ".env", "up", "--build"]);
  });

  it("omits --build when --no-build is set", () => {
    const args = buildComposeArgs({ ...defaults(), noBuild: true }, COMPOSE);
    expect(args).not.toContain("--build");
  });

  it("omits --build when --rebuild is set (already built separately)", () => {
    const args = buildComposeArgs({ ...defaults(), rebuild: true }, COMPOSE);
    expect(args).not.toContain("--build");
  });

  it("appends -d when detach is set", () => {
    const args = buildComposeArgs({ ...defaults(), detach: true }, COMPOSE);
    expect(args).toContain("-d");
  });
});
