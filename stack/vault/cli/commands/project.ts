import { openVault } from "../../core.js";
import { exportToken } from "../../crypto.js";
import {
  createProject,
  getProjectKey,
  listProjects,
  removeProject,
  rotateProject,
} from "../../ops/projects.js";
import { requireArg } from "../args.js";
import { getAdminMasterKey } from "../auth.js";
import { VAULT_PATH } from "../env.js";

async function handleProject(args: string[]): Promise<void> {
  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case "create": {
      const name = subArgs[0];
      requireArg(name, "project create <name>");
      const db = openVault(VAULT_PATH);
      try {
        const masterKey = await getAdminMasterKey(db);
        const projectKey = createProject(db, masterKey, name);
        const token = exportToken(projectKey);
        console.log(`Project "${name}" created`);
        console.log(`Token: ${token}`);
      } finally {
        db.close();
      }
      break;
    }
    case "export": {
      const name = subArgs[0];
      requireArg(name, "project export <name>");
      const db = openVault(VAULT_PATH);
      try {
        const masterKey = await getAdminMasterKey(db);
        const projectKey = getProjectKey(db, masterKey, name);
        console.log(exportToken(projectKey));
      } finally {
        db.close();
      }
      break;
    }
    case "list": {
      const db = openVault(VAULT_PATH);
      try {
        await getAdminMasterKey(db);
        const projects = listProjects(db);
        if (projects.length === 0) {
          console.log("No projects in vault");
          return;
        }
        for (const project of projects) {
          console.log(`  ${project}`);
        }
      } finally {
        db.close();
      }
      break;
    }
    case "remove": {
      const name = subArgs[0];
      requireArg(name, "project remove <name>");
      const db = openVault(VAULT_PATH);
      try {
        await getAdminMasterKey(db);
        removeProject(db, name);
        console.log(`Removed project "${name}"`);
      } finally {
        db.close();
      }
      break;
    }
    case "rotate": {
      const name = subArgs[0];
      requireArg(name, "project rotate <name>");
      const db = openVault(VAULT_PATH);
      try {
        const masterKey = await getAdminMasterKey(db);
        const newKey = rotateProject(db, masterKey, name);
        const token = exportToken(newKey);
        console.log(`Rotated key for project "${name}"`);
        console.log(`New token: ${token}`);
      } finally {
        db.close();
      }
      break;
    }
    default:
      console.error(`Unknown project subcommand: ${subcommand ?? "(none)"}`);
      process.exit(1);
  }
}

export { handleProject };
