import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

export interface CheckOptions {
  taskName: string;
  help: boolean;
  detach: boolean;
  safeMode: boolean;
  noVnc: boolean;
  noBuild: boolean;
  rebuild: boolean;
  persistProfile: boolean;
}

export function parseArgs(argv: string[]): CheckOptions {
  const opts: CheckOptions = {
    taskName: "",
    help: false,
    detach: false,
    safeMode: false,
    noVnc: false,
    noBuild: false,
    rebuild: false,
    persistProfile: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--detach":
      case "-d":
        opts.detach = true;
        break;
      case "--safemode":
        opts.safeMode = true;
        break;
      case "--no-vnc":
        opts.noVnc = true;
        break;
      case "--no-build":
        opts.noBuild = true;
        break;
      case "--rebuild":
        opts.rebuild = true;
        break;
      case "--persist-profile":
        opts.persistProfile = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        if (!opts.taskName) {
          opts.taskName = arg;
        } else {
          throw new Error(`Unexpected argument: ${arg}`);
        }
    }
  }

  return opts;
}

const VAULT_TOKEN_LINE = /^VAULT_TOKEN(?:_[A-Z0-9_]+=|=).+/mu;

export function hasVaultToken(envContents: string): boolean {
  return VAULT_TOKEN_LINE.test(envContents);
}

export function computeSourceHash(gitOutput: string): string {
  return createHash("sha256").update(gitOutput).digest("hex").slice(0, 12);
}

// SHA256("") truncated to 12 chars — returned when git output is empty
const EMPTY_TREE_HASH = "01ba4719c80b";

export function computeSourceHashFromGit(): string {
  try {
    const gitOutput = execSync("git ls-files -s stack/ package.json package-lock.json", {
      encoding: "utf-8",
    });
    const hash = computeSourceHash(gitOutput);
    return hash === EMPTY_TREE_HASH ? "" : hash;
  } catch {
    return "";
  }
}

export function buildComposeArgs(opts: CheckOptions, composeFile: string): string[] {
  const args = ["compose", "-f", composeFile];

  args.push("--env-file", ".env", "up");

  const shouldBuild = !opts.noBuild && !opts.rebuild;
  if (shouldBuild) {
    args.push("--build");
  }

  if (opts.detach) {
    args.push("-d");
  }

  return args;
}
