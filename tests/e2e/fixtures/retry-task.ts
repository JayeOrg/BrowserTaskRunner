import type { BrowserAPI } from "../../../stack/browser/browser.js";
import type {
  RetryingTask,
  TaskContext,
  TaskResultSuccess,
} from "../../../stack/framework/tasks.js";
import { StepError } from "../../../stack/framework/errors.js";

const TASK_NAME = "retry-test";

let attemptCount = 0;

function resetAttempts(): void {
  attemptCount = 0;
}

async function run(browser: BrowserAPI, context: TaskContext): Promise<TaskResultSuccess> {
  attemptCount++;
  const failUntil = parseInt(context.failUntil ?? "0", 10);

  if (attemptCount <= failUntil) {
    throw new StepError(TASK_NAME, "check", "NOT_READY_YET", {
      details: `Attempt ${attemptCount.toString()} of ${failUntil.toString()}`,
    });
  }

  await browser.ping();
  return { step: "verify" };
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
