import "dotenv/config";
import { toErrorMessage } from "../../framework/errors.js";
import { handleDetail } from "./commands/detail.js";
import { handleProject } from "./commands/project.js";
import {
  handleInit,
  handleLogin,
  handleLogout,
  handleStatus,
  handleChangePassword,
} from "./commands/session.js";

function usage(): never {
  console.log(`Usage: npm run vault -- <command> [args]

Commands:
  init                                    Initialize vault
  login [--duration <minutes>]            Start session (default 30 min)
  logout                                  End session
  status                                  Show current session status

  detail set <project> <key>              Add or update a detail (prompts for value)
  detail get <project> <key>              Show a detail value
  detail list [<project>]                 List details
  detail remove <project> <key>           Remove a detail

  project create <name> [--write-env]      Create project and output token
  project export <name> [--write-env]      Export project token
  project list                            List projects
  project remove <name>                   Remove a project (cascades details)
  project rename <old-name> <new-name>    Rename a project
  project rotate <name> [--write-env]      Rotate project key
  project setup <name>                    Check and add missing details

  change-password                          Change vault password`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);

  if (!command || command === "help" || command === "--help") {
    usage();
  }

  switch (command) {
    case "init":
      await handleInit();
      break;
    case "login":
      await handleLogin(commandArgs);
      break;
    case "logout":
      await handleLogout();
      break;
    case "status":
      await handleStatus();
      break;
    case "change-password":
      await handleChangePassword();
      break;
    case "detail":
      await handleDetail(commandArgs);
      break;
    case "project":
      await handleProject(commandArgs);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(`Error: ${toErrorMessage(error)}`);
  process.exit(1);
});
