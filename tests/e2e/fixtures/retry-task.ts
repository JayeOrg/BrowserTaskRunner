import type { BrowserAPI } from "../../../stack/browser/browser.js";
import type { RetryingTask, VaultSecrets } from "../../../stack/framework/tasks.js";
import { StepError } from "../../../stack/framework/errors.js";

const TASK_NAME = "retry-test";

let attemptCount = 0;

function resetAttempts(): void {
  attemptCount = 0;
}

async function run(browser: BrowserAPI, context: VaultSecrets): Promise<string> {
  attemptCount++;
  const failUntil = parseInt(context.failUntil ?? "0", 10);

  if (attemptCount <= failUntil) {
    throw new StepError(TASK_NAME, "check", "NOT_READY_YET", {
      summary: `Attempt ${attemptCount.toString()} of ${failUntil.toString()}`,
    });
  }

  await browser.getUrl();
  return "verify";
}

const retryTask: RetryingTask = {
  name: TASK_NAME,
  displayUrl: "http://localhost",
  project: "test",
  needs: { failUntil: "fail_until" },
  mode: "retry",
  intervalMs: 10,
  run,
};

export { retryTask, resetAttempts };
