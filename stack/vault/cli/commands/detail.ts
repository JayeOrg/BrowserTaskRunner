import { setDetail, getDetail, listDetails, removeDetail } from "../../ops/details.js";
import { requireArg } from "../args.js";
import { resolveAdminAuth } from "../auth.js";
import { withVault, withVaultReadOnly } from "../env.js";
import { getSecretValue, promptConfirm } from "../prompt.js";

async function handleDetailSet(subArgs: string[]): Promise<void> {
  const project = subArgs[0];
  const key = subArgs[1];
  requireArg(project, "detail set <project> <key>");
  requireArg(key, "detail set <project> <key>");
  await withVault(async (db) => {
    const masterKey = await resolveAdminAuth(db);
    const value = await getSecretValue();
    setDetail(db, masterKey, project, key, value);
    console.log(`Set detail "${key}" in project "${project}"`);
  });
}

async function handleDetailGet(subArgs: string[]): Promise<void> {
  const project = subArgs[0];
  const key = subArgs[1];
  requireArg(project, "detail get <project> <key>");
  requireArg(key, "detail get <project> <key>");
  await withVault(async (db) => {
    const masterKey = await resolveAdminAuth(db);
    console.log(getDetail(db, masterKey, project, key));
  });
}

async function handleDetailList(subArgs: string[]): Promise<void> {
  await withVaultReadOnly(async (db) => {
    await resolveAdminAuth(db);
    const project = subArgs[0];
    const details = listDetails(db, project);
    if (details.length === 0) {
      console.log(project ? `No details in project "${project}"` : "No details in vault");
      return;
    }
    if (project) {
      console.log(`Details in "${project}":`);
      for (const detail of details) {
        console.log(`  ${detail.key}`);
      }
    } else {
      console.log("Details:");
      for (const detail of details) {
        console.log(`  ${detail.key} (${detail.project})`);
      }
    }
  });
}

async function handleDetailRemove(subArgs: string[]): Promise<void> {
  const project = subArgs[0];
  const key = subArgs[1];
  requireArg(project, "detail remove <project> <key>");
  requireArg(key, "detail remove <project> <key>");
  const confirmed = await promptConfirm(`Remove detail "${key}" from project "${project}"?`);
  if (!confirmed) {
    console.log("Aborted");
    return;
  }
  await withVault(async (db) => {
    await resolveAdminAuth(db);
    removeDetail(db, project, key);
    console.log(`Removed detail "${key}" from project "${project}"`);
  });
}

async function handleDetail(args: string[]): Promise<void> {
  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case "set":
      await handleDetailSet(subArgs);
      break;
    case "get":
      await handleDetailGet(subArgs);
      break;
    case "list":
      await handleDetailList(subArgs);
      break;
    case "remove":
      await handleDetailRemove(subArgs);
      break;
    default:
      console.error(`Unknown detail subcommand: ${subcommand ?? "(none)"}`);
      process.exit(1);
  }
}

export { handleDetail };
