import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { tailLines } from "./run-utils.js";

// =============================================================================
// Configuration
// =============================================================================
const DISPLAY_NUM = process.env["DISPLAY_NUM"] ?? "99";
const WS_PORT = process.env["WS_PORT"] ?? "8765";
const SCREEN_SIZE = process.env["SCREEN_SIZE"] ?? "1280x720x24";
const LOG_DIR = process.env["LOG_DIR"] ?? "/app/logs";
const READINESS_TIMEOUT = Number(process.env["READINESS_TIMEOUT"] ?? "30");
if (Number.isNaN(READINESS_TIMEOUT)) {
  throw new Error(`Invalid READINESS_TIMEOUT: "${String(process.env["READINESS_TIMEOUT"])}"`);
}
const CHROME_PROFILE_DIR = "/tmp/chrome-profile";

process.env["DISPLAY"] = `:${DISPLAY_NUM}`;

const XVFB_LOG = join(LOG_DIR, "xvfb.log");
const CHROMIUM_LOG = join(LOG_DIR, "chromium.log");
const VNC_LOG = join(LOG_DIR, "vnc.log");
const LOG_FILES = [XVFB_LOG, CHROMIUM_LOG, VNC_LOG];

const CHROMIUM_FLAGS = [
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-translate",
  "--metrics-recording-only",
  "--disable-features=MediaRouter,MediaCapture",
  "--disable-notifications",
  "--start-maximized",
];

// =============================================================================
// Logging utilities
// =============================================================================
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const TERM_WIDTH = 120;
let previousLogTime = Math.floor(Date.now() / 1000);

function elapsedSinceLastLog(): string {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - previousLogTime;
  previousLogTime = now;
  return `${String(elapsed)}s`;
}

function formatLog(icon: string, color: string, msg: string): void {
  const duration = elapsedSinceLastLog();
  const text = `[Infra] ${msg}`;
  const padding = Math.max(1, TERM_WIDTH - text.length - duration.length - 2);
  process.stdout.write(
    `${color}${icon}${RESET} ${text}${" ".repeat(padding)}${DIM}${duration}${RESET}\n`,
  );
}

function log(msg: string): void {
  formatLog("→", CYAN, msg);
}
function logSuccess(msg: string): void {
  formatLog("✓", GREEN, msg);
}
function logError(msg: string): void {
  formatLog("✗", RED, msg);
}

// =============================================================================
// Readiness checks
// =============================================================================
async function waitForDisplay(timeout: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout * 1000) {
    const result = spawnSync("xdpyinfo", ["-display", `:${DISPLAY_NUM}`], {
      stdio: "ignore",
    });
    if (result.status === 0) return true;
    await sleep(200);
  }
  return false;
}

// =============================================================================
// Cleanup and lifecycle
// =============================================================================
mkdirSync(LOG_DIR, { recursive: true });

function writeDefaultChromePreferences(profileDir: string): void {
  const prefsDir = join(profileDir, "Default");
  mkdirSync(prefsDir, { recursive: true });
  const prefsPath = join(prefsDir, "Preferences");
  // Only write defaults if no existing preferences (preserves persisted profile state)
  if (!existsSync(prefsPath)) {
    writeFileSync(
      prefsPath,
      JSON.stringify(
        {
          credentials_enable_service: false,
          profile: { password_manager_enabled: false },
        },
        null,
        2,
      ),
    );
  }
}

function prepareChromeProfile(): void {
  if (process.env["PERSIST_CHROME_PROFILE"] === "true") {
    log("Chrome profile persistence enabled — preserving existing profile");
    mkdirSync(CHROME_PROFILE_DIR, { recursive: true });
  } else {
    rmSync(CHROME_PROFILE_DIR, { recursive: true, force: true });
    mkdirSync(CHROME_PROFILE_DIR, { recursive: true });
  }
}

function cleanup(): void {
  spawnSync("pkill", ["-f", "Xvfb"], { stdio: "ignore" });
  spawnSync("pkill", ["-f", "chromium"], { stdio: "ignore" });
  rmSync(`/tmp/.X${DISPLAY_NUM}-lock`, { force: true });
  rmSync(`/tmp/.X11-unix/X${DISPLAY_NUM}`, { force: true });
  prepareChromeProfile();
  log("Cleaned up stale processes");
}

function spawnWithLog(cmd: string, args: string[], logPath: string): ChildProcess {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  const logStream = createWriteStream(logPath, { flags: "a" });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  return child;
}

function tailFile(path: string, lines: number): string {
  try {
    return tailLines(readFileSync(path, "utf-8"), lines);
  } catch {
    return "";
  }
}

function handleExit(exitStatus: number): void {
  if (exitStatus !== 0) {
    logError(`Exit with status ${String(exitStatus)}`);

    console.log("\nRecent third-party logs:");
    for (const logfile of LOG_FILES) {
      if (existsSync(logfile) && statSync(logfile).size > 0) {
        console.log(`--- ${basename(logfile)} ---`);
        console.log(tailFile(logfile, 20));
      }
    }
  }

  cleanup();
}

// =============================================================================
// Startup sequence
// =============================================================================
async function main(): Promise<void> {
  const taskName = process.env["TASK_NAME"];
  if (!taskName) {
    logError("TASK_NAME environment variable is required");
    process.exit(1);
  }

  cleanup();

  log(`Configuration: display=:${DISPLAY_NUM}, ws_port=${WS_PORT}, screen=${SCREEN_SIZE}`);
  log(`Logs will be written to ${LOG_DIR}`);

  spawnWithLog("Xvfb", [`:${DISPLAY_NUM}`, "-screen", "0", SCREEN_SIZE], XVFB_LOG);

  if (!(await waitForDisplay(READINESS_TIMEOUT))) {
    logError(`Xvfb failed to start within ${String(READINESS_TIMEOUT)}s`);
    console.log(tailFile(XVFB_LOG, 20));
    process.exit(1);
  }
  logSuccess(`Virtual display :${DISPLAY_NUM} ready`);

  if (process.env["ENABLE_VNC"] === "true") {
    spawnWithLog("x11vnc", ["-display", `:${DISPLAY_NUM}`, "-forever", "-nopw", "-quiet"], VNC_LOG);
    log("VNC server spawned on port 5900");
  }

  writeDefaultChromePreferences(CHROME_PROFILE_DIR);

  // Write WS port to a file — Chrome extensions can't read env vars,
  // So the extension reads this file at connect time instead
  writeFileSync("/app/dist/extension/ws-port", WS_PORT);

  // --no-sandbox is required when running as root in Docker.
  // Docker provides container isolation, making Chrome's sandbox redundant.
  const chromium = spawnWithLog(
    process.env["CHROME_PATH"] ?? "chromium",
    [
      ...CHROMIUM_FLAGS,
      "--load-extension=/app/dist/extension",
      `--user-data-dir=${CHROME_PROFILE_DIR}`,
      "about:blank",
    ],
    CHROMIUM_LOG,
  );

  // Wait for Chromium process to survive startup
  await sleep(2000);
  if (chromium.exitCode !== null) {
    logError("Chromium failed to start");
    console.log(tailFile(CHROMIUM_LOG, 20));
    process.exit(1);
  }
  logSuccess(`Chromium started with extension (pid: ${String(chromium.pid)})`);

  // Copy vault to writable location (SQLite WAL mode needs sibling -wal/-shm files)
  copyFileSync("/app/vault.db", "/tmp/vault.db");
  const vaultPath = "/tmp/vault.db";
  // eslint-disable-next-line require-atomic-updates -- No race: this is a synchronous entrypoint, not concurrent
  process.env["VAULT_PATH"] = vaultPath;

  // Run the task — this is the final action; process exits when it completes
  log(`Starting task: ${taskName}`);
  const task = spawn("node", ["/app/dist/framework/run.js", taskName], {
    stdio: "inherit",
    env: process.env,
  });

  const exitCode = await new Promise<number>((resolve) => {
    task.on("close", (code) => {
      resolve(code ?? 1);
    });
    task.on("error", (err) => {
      logError(`Failed to start task: ${err.message}`);
      resolve(1);
    });
  });

  handleExit(exitCode);
  process.exit(exitCode);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logError(`Fatal error: ${message}`);
  handleExit(1);
  process.exit(1);
});
