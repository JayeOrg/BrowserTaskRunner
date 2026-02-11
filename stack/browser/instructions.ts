import path from "node:path";
import type { PrefixLogger } from "../framework/logging.js";

function isAutomatedEnvironment(): boolean {
  return Boolean(process.env["DOCKER"] || process.env["CI"] || process.env["VITEST"]);
}

export function logConnectionInstructions(logger: PrefixLogger, port: number): void {
  logger.log("WebSocket server listening", { port });

  if (isAutomatedEnvironment()) {
    return;
  }

  const extensionPath = path.resolve(import.meta.dirname, "../../dist/extension");
  logger.log("Waiting for Chrome extension to connect...");
  logger.log("=".repeat(50));
  logger.log("CONNECT THE EXTENSION:");
  logger.log("1. Open Chrome");
  logger.log("2. Go to chrome://extensions");
  logger.log('3. Enable "Developer mode"');
  logger.log('4. Click "Load unpacked"');
  logger.log(`5. Select: ${extensionPath}`);
  logger.log("6. Open a new tab (extension needs an active tab)");
  logger.log("=".repeat(50));
}
