import type { BrowserAPI } from "../../../browser/browser.js";
import {
  needsFromSchema,
  type RetryingTask,
  type TaskContext,
  type TaskResultSuccess,
} from "../../../framework/tasks.js";
import type { StepLogger } from "../../../framework/logging.js";
import { StepRunner, type StepRunnerDeps } from "../../../framework/step-runner.js";
import { clickFirst, fillFirst } from "../../utils/selectors.js";
import { loginContextSchema } from "../../utils/schemas.js";
import { sleep } from "../../utils/timing.js";
import { clickTurnstile } from "../../utils/turnstile.js";
import { pollUntil } from "../../utils/poll.js";

const TASK = {
  name: "botcLogin",
  url: "https://botc.app/",
} as const;

const FINAL_STEP = "checkResult" as const;

const TIMINGS = {
  afterNav: 2000,
  afterTurnstile: 3000,
  beforeTurnstile: 1000,
  waitEmail: 15000,
  waitPassword: 5000,
} as const;

const SELECTORS = {
  email: ['input[type="email"]', 'input[name="email"]', "input#email"],
  password: ['input[type="password"]', 'input[name="password"]', "input#password"],
  submit: [
    'button[type="submit"]',
    'button:contains("Log in")',
    'button:contains("Sign in")',
    'input[type="submit"]',
  ],
} as const;

async function navigate(browser: BrowserAPI, log: StepLogger): Promise<void> {
  await browser.navigate(TASK.url);
  await sleep(TIMINGS.afterNav);
  const { url, title } = await browser.getUrl();
  log.success("Navigated", { url, title });
}

async function fillLogin(
  browser: BrowserAPI,
  log: StepLogger,
  email: string,
  password: string,
): Promise<void> {
  const emailResult = await fillFirst(browser, SELECTORS.email, email, TIMINGS.waitEmail);
  if (!emailResult.found) {
    log.fail("EMAIL_INPUT_NOT_FOUND", {
      details: `Selectors tried: ${SELECTORS.email.join(", ")}`,
    });
  }

  const passResult = await fillFirst(browser, SELECTORS.password, password, TIMINGS.waitPassword);
  if (!passResult.found) {
    log.fail("PASSWORD_INPUT_NOT_FOUND", {
      details: `Selectors tried: ${SELECTORS.password.join(", ")}`,
    });
  }
  log.success("Entered credentials");
}

async function turnstileBeforeSubmit(browser: BrowserAPI, log: StepLogger): Promise<void> {
  await sleep(TIMINGS.beforeTurnstile);

  const result = await clickTurnstile(browser);
  if (result.found) {
    log.success("Clicked (beforeSubmit)", {
      selector: result.selector,
    });
    await sleep(TIMINGS.afterTurnstile);
  } else {
    log.success("None found (beforeSubmit)");
  }
}

// DOM click — Cloudflare rejects CDP-dispatched events on form submission
async function submit(browser: BrowserAPI, log: StepLogger): Promise<void> {
  const result = await clickFirst(browser, SELECTORS.submit);
  if (result.found) {
    log.success("Submitted", { selector: result.selector });
    return;
  }
  log.fail("SUBMIT_NOT_FOUND", {
    details: `Selectors tried: ${SELECTORS.submit.join(", ")}. Errors: ${result.error ?? "none"}`,
  });
}

async function checkResult(browser: BrowserAPI, log: StepLogger): Promise<string> {
  const result = await pollUntil(
    () => browser.getUrl(),
    ({ url }) => !url.toLowerCase().includes("login"),
    { timeoutMs: 15_000, intervalMs: 2_000 },
  );
  if (!result.ok) {
    return log.fail("STILL_ON_LOGIN_PAGE");
  }
  log.success("Login successful", { finalUrl: result.value.url });
  return result.value.url;
}

async function run(
  browser: BrowserAPI,
  context: TaskContext,
  deps: StepRunnerDeps,
): Promise<TaskResultSuccess> {
  const { email, password } = loginContextSchema.parse(context);
  let finalUrl = "";

  const runner = new StepRunner(deps);

  runner
    .step("navigate", (log) => navigate(browser, log))
    .step("fillLogin", (log) => fillLogin(browser, log, email, password))
    .step("turnstileBeforeSubmit", (log) => turnstileBeforeSubmit(browser, log))
    .step("submit", (log) => submit(browser, log))
    .step(FINAL_STEP, async (log) => {
      finalUrl = await checkResult(browser, log);
    });

  await runner.execute();

  return {
    step: FINAL_STEP,
    finalUrl,
    context: { task: TASK.name },
  };
}

export const task: RetryingTask = {
  name: TASK.name,
  url: TASK.url,
  project: "monitor-botc",
  needs: needsFromSchema(loginContextSchema),
  mode: "retry",
  intervalMs: 300_000,
  contextSchema: loginContextSchema,
  run,
};
