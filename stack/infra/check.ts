import { existsSync, readFileSync } from "node:fs";
import { execSync, spawn, spawnSync } from "node:child_process";
import {
  parseArgs,
  hasVaultToken,
  computeSourceHashFromGit,
  buildComposeArgs,
  type CheckOptions,
} from "./check-args.js";

const COMPOSE_FILE = "stack/infra/docker-compose.yml";

function showHelp(): void {
  console.log(`Usage: npm run check <taskName> [options]

Run a SiteCheck task in Docker.

Arguments:
  taskName          Name of the task to run (e.g., botcLogin)

Options:
  --detach, -d      Run in background (detached mode)
  --safe-mode       Skip destructive final action (e.g., skip Place Order)
  --no-vnc          Disable VNC server
  --no-build        Skip Docker build step
  --rebuild         Force fresh build (no cache)
  --persist-profile Persist Chrome profile across runs (keeps login sessions)
  --help, -h        Show this help message

Shortcuts:
  npm run logs      Follow container logs
  npm run shell     Open shell in container
  npm run stop      Stop container

Examples:
  npm run check botcLogin                    Run botcLogin task
  npm run check botcLogin --detach           Run in background
  npm run check botcLogin --no-vnc           Run without VNC
  npm run check botcLogin --rebuild          Force fresh Docker build
  npm run check nandosOrder --persist-profile Keep login session across runs
  npm run check nandosOrder --safe-mode        Run without placing final order`);
}

function main(): void {
  let opts: CheckOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    console.error("Use --help for usage information");
    process.exit(1);
  }

  if (opts.help) {
    showHelp();
    process.exit(0);
  }

  if (!opts.taskName) {
    console.error("Error: Missing task name");
    console.error("");
    showHelp();
    process.exit(1);
  }

  if (!existsSync(".env")) {
    console.error("Error: .env file not found");
    console.error("Copy .env.example to .env and fill in your credentials:");
    console.error("  cp .env.example .env");
    process.exit(1);
  }

  const envContents = readFileSync(".env", "utf-8");
  if (!hasVaultToken(envContents)) {
    console.error("Error: .env must define at least one vault token");
    console.error("  VAULT_TOKEN_<PROJECT>=<token>  (preferred, e.g. VAULT_TOKEN_NANDOS=...)");
    console.error("  VAULT_TOKEN=<token>            (legacy fallback)");
    console.error("Generate with: npm run vault -- project export <name>");
    process.exit(1);
  }

  if (opts.rebuild && opts.noBuild) {
    console.error("--rebuild and --no-build are mutually exclusive");
    process.exit(1);
  }

  // Cache-bust hash from git index. Falls back to timestamp outside a git repo.
  const sourceHash = computeSourceHashFromGit() || String(Math.floor(Date.now() / 1000));

  process.env["TASK_NAME"] = opts.taskName;
  process.env["SOURCE_HASH"] = sourceHash;
  process.env["HOST_UID"] = execSync("id -u", { encoding: "utf-8" }).trim();
  process.env["HOST_GID"] = execSync("id -g", { encoding: "utf-8" }).trim();

  if (opts.noVnc) {
    process.env["ENABLE_VNC"] = "false";
  }
  if (opts.safeMode) {
    process.env["SAFE_MODE"] = "true";
  }
  if (opts.persistProfile) {
    process.env["PERSIST_CHROME_PROFILE"] = "true";
  }

  if (opts.rebuild) {
    console.log("Forcing fresh build (no cache)...");
    const buildResult = spawnSync(
      "docker",
      ["compose", "-f", COMPOSE_FILE, "--env-file", ".env", "build", "--no-cache"],
      {
        stdio: "inherit",
      },
    );
    if (buildResult.status !== 0) {
      console.error("Docker build failed");
      process.exit(buildResult.status ?? 1);
    }
  }

  const composeArgs = buildComposeArgs(opts, COMPOSE_FILE);

  if (opts.detach) {
    console.log("Starting in background...");
    console.log("Use 'npm run logs' to follow logs");
    console.log("Use 'npm run stop' to stop");
  }

  const child = spawn("docker", composeArgs, { stdio: "inherit" });
  child.on("close", (code) => {
    process.exit(code ?? 1);
  });
}

main();
