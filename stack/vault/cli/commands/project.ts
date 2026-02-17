import { exportToken } from "../../crypto.js";
import {
  createProject,
  getProjectKey,
  listProjects,
  removeProject,
  rotateProject,
  renameProject,
} from "../../ops/projects.js";
import { listDetails, setDetail } from "../../ops/details.js";
import { getProjectNeeds } from "../../../framework/loader.js";
import { requireArg } from "../args.js";
import { resolveAdminAuth } from "../auth.js";
import { setEnvVar, withVault } from "../env.js";
import { promptConfirm, getSecretValue } from "../prompt.js";

function tokenEnvKey(project: string): string {
  return `VAULT_TOKEN_${project.toUpperCase().replace(/-/gu, "_")}`;
}

function parseProjectArgs(subArgs: string[], usage: string): { name: string; writeEnv: boolean } {
  const writeEnv = subArgs.includes("--write-env");
  const positional = subArgs.filter((arg) => arg !== "--write-env");
  const name = positional[0];
  requireArg(name, usage);
  return { name, writeEnv };
}

function writeTokenToEnv(name: string, token: string): void {
  const envKey = tokenEnvKey(name);
  setEnvVar(envKey, token);
  console.log(`Token written to .env as ${envKey}`);
}

async function handleProject(args: string[]): Promise<void> {
  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case "create": {
      const { name, writeEnv } = parseProjectArgs(subArgs, "project create <name> [--write-env]");
      await withVault(async (db) => {
        const masterKey = await resolveAdminAuth(db);
        const projectKey = createProject(db, masterKey, name);
        const token = exportToken(projectKey);
        console.error(`Project "${name}" created`);
        if (writeEnv) writeTokenToEnv(name, token);
        else console.log(token);
      });
      break;
    }
    case "export": {
      const { name, writeEnv } = parseProjectArgs(subArgs, "project export <name> [--write-env]");
      await withVault(async (db) => {
        const masterKey = await resolveAdminAuth(db);
        const projectKey = getProjectKey(db, masterKey, name);
        const token = exportToken(projectKey);
        if (writeEnv) writeTokenToEnv(name, token);
        else console.log(token);
      });
      break;
    }
    case "list": {
      await withVault(async (db) => {
        await resolveAdminAuth(db);
        const projects = listProjects(db);
        if (projects.length === 0) {
          console.log("No projects in vault");
          return;
        }
        console.log("Projects:");
        for (const project of projects) {
          console.log(`  ${project}`);
        }
      });
      break;
    }
    case "remove": {
      const name = subArgs[0];
      requireArg(name, "project remove <name>");
      const confirmed = await promptConfirm(`Remove project "${name}" and all its details?`);
      if (!confirmed) {
        console.log("Aborted");
        return;
      }
      await withVault(async (db) => {
        await resolveAdminAuth(db);
        removeProject(db, name);
        console.log(`Removed project "${name}"`);
      });
      break;
    }
    case "rename": {
      const oldName = subArgs[0];
      const newName = subArgs[1];
      requireArg(oldName, "project rename <old-name> <new-name>");
      requireArg(newName, "project rename <old-name> <new-name>");
      await withVault(async (db) => {
        await resolveAdminAuth(db);
        renameProject(db, oldName, newName);
        console.log(`Renamed project "${oldName}" to "${newName}"`);
      });
      break;
    }
    case "setup": {
      const name = subArgs[0];
      requireArg(name, "project setup <name>");
      const needs = await getProjectNeeds(name);
      if (needs.length === 0) {
        console.log(`No tasks found for project "${name}" (is the project built?)`);
        return;
      }
      await withVault(async (db) => {
        const masterKey = await resolveAdminAuth(db);
        const existing = new Set(listDetails(db, name).map((detail) => detail.key));
        const missing = needs.filter((key) => !existing.has(key));

        console.log(`Project "${name}" needs: ${needs.join(", ")}`);
        for (const key of needs) {
          console.log(`  ${key} ${existing.has(key) ? "\u2713" : "\u2717"}`);
        }

        if (missing.length === 0) {
          console.log("All details present");
          return;
        }

        console.log(`\nMissing ${String(missing.length)} detail(s):`);
        for (const key of missing) {
          console.log(`\nEnter value for "${key}":`);
          const value = await getSecretValue();
          setDetail(db, masterKey, name, key, value);
          console.log(`  Set "${key}"`);
        }
        console.log("\nSetup complete");
      });
      break;
    }
    case "rotate": {
      const { name, writeEnv } = parseProjectArgs(subArgs, "project rotate <name> [--write-env]");
      await withVault(async (db) => {
        const masterKey = await resolveAdminAuth(db);
        const newKey = rotateProject(db, masterKey, name);
        const token = exportToken(newKey);
        console.log(`Rotated key for project "${name}"`);
        if (writeEnv) writeTokenToEnv(name, token);
        else console.log(`Token: ${token}`);
      });
      break;
    }
    default:
      console.error(`Unknown project subcommand: ${subcommand ?? "(none)"}`);
      process.exit(1);
  }
}

export { handleProject };
