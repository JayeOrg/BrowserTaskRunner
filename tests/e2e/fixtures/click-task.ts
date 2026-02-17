import type { BrowserAPI } from "../../../stack/browser/browser.js";
import type {
  SingleAttemptTask,
  VaultSecrets,
  TaskResultSuccess,
} from "../../../stack/framework/tasks.js";
import { StepError } from "../../../stack/framework/errors.js";

const TASK_NAME = "click-test";

async function run(browser: BrowserAPI, context: VaultSecrets): Promise<TaskResultSuccess> {
  await browser.navigate(context.url);

  const button = await browser.waitForSelector("#go");
  if (!button.found) {
    throw new StepError(TASK_NAME, "findButton", "BUTTON_NOT_FOUND");
  }

  const clicked = await browser.click("#go");
  if (!clicked.success) {
    throw new StepError(TASK_NAME, "click", "CLICK_FAILED");
  }

  const { url: finalUrl } = await browser.getUrl();
  if (!finalUrl.includes("/success")) {
    throw new StepError(TASK_NAME, "verify", "NOT_ON_SUCCESS_PAGE", { finalUrl });
  }

  return { step: "verify", finalUrl };
}

export const clickTask: SingleAttemptTask = {
  name: TASK_NAME,
  displayUrl: "http://localhost",
  project: "test",
  needs: { url: "url" },
  mode: "once",
  run,
};
