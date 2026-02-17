import { createHash } from "node:crypto";

export interface CheckOptions {
  taskName: string;
  help: boolean;
  detach: boolean;
  dryRun: boolean;
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
    dryRun: false,
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
      case "--dry-run":
        opts.dryRun = true;
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
        }
    }
  }

  return opts;
}

export function hasVaultToken(envContents: string): boolean {
  return /^VAULT_TOKEN(?:_[A-Z0-9_]+=|=).+/mu.test(envContents);
}

export function computeSourceHash(gitOutput: string): string {
  return createHash("sha256").update(gitOutput).digest("hex").slice(0, 12);
}

export function buildComposeArgs(opts: CheckOptions, composeFile: string): string[] {
  const args = ["compose", "-f", composeFile];

  args.push("--env-file", ".env", "up");

  // --build by default; skip if --no-build, or if --rebuild already built above
  if (!opts.noBuild && !opts.rebuild) {
    args.push("--build");
  }

  if (opts.detach) {
    args.push("-d");
  }

  return args;
}
