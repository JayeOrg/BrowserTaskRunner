import type { BrowserAPI } from "../../../browser/browser.js";
import {
  needsFromSchema,
  type RetryingTask,
  type VaultSecrets,
  type TaskResultSuccess,
} from "../../../framework/tasks.js";
import type { StepLogger } from "../../../framework/logging.js";
import { StepRunner, type StepRunnerDeps } from "../../../framework/step-runner.js";
import { clickFirst, fillFirst, LOGIN_SELECTORS } from "../../utils/selectors.js";
import { loginSecretsSchema } from "../../utils/schemas.js";
import { sleep } from "../../utils/timing.js";
import { detectAndClickTurnstile } from "../../utils/turnstile.js";
import { pollUntil } from "../../utils/poll.js";

const TASK = {
  name: "botcLogin",
  displayUrl: "https://botc.app/",
} as const;

const FINAL_STEP = "checkResult" as const;

const TIMINGS = {
  afterNav: 2000,
  afterTurnstile: 3000,
  beforeTurnstile: 1000,
  waitEmail: 15000,
  waitPassword: 5000,
  waitResult: 15_000,
} as const;

const SELECTORS = {
  ...LOGIN_SELECTORS,
  submit: ['button[type="submit"]', 'input[type="submit"]'],
} as const;

async function navigate(browser: BrowserAPI, log: StepLogger): Promise<void> {
  await browser.navigate(TASK.displayUrl);
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
  if (!emailResult.found) log.fatal("EMAIL_INPUT_NOT_FOUND", { error: emailResult.error });

  const passResult = await fillFirst(browser, SELECTORS.password, password, TIMINGS.waitPassword);
  if (!passResult.found)
    log.fatal("PASSWORD_INPUT_NOT_FOUND", {
      summary: `Selectors tried: ${SELECTORS.password.join(", ")}`,
    });
  log.success("Entered credentials");
}

async function turnstileBeforeSubmit(browser: BrowserAPI, log: StepLogger): Promise<void> {
  await sleep(TIMINGS.beforeTurnstile);

  const result = await detectAndClickTurnstile(browser);
  if (result.found) {
    log.success("Clicked turnstile", { selector: result.selector });
    await sleep(TIMINGS.afterTurnstile);
  } else {
    log.success("No turnstile found");
  }
}

// DOM click — Cloudflare rejects CDP-dispatched events on form submission
async function submit(browser: BrowserAPI, log: StepLogger): Promise<void> {
  const result = await clickFirst(browser, SELECTORS.submit);
  if (result.found) {
    log.success("Submitted", { selector: result.selector });
    return;
  }
  const errorSummary = result.error.map((re) => `${re.selector}: ${re.error}`).join("; ");
  log.fatal("SUBMIT_NOT_FOUND", { summary: `Selectors tried: ${errorSummary}` });
}

async function checkResult(browser: BrowserAPI, log: StepLogger): Promise<string> {
  const result = await pollUntil(
    () => browser.getUrl(),
    ({ url }) => url.includes("/app") || url.includes("/home") || url.includes("/dashboard"),
    { timeoutMs: TIMINGS.waitResult, intervalMs: 2_000 },
  );
  if (!result.ok) {
    return log.fatal("STILL_ON_LOGIN_PAGE");
  }
  log.success("Login successful", { finalUrl: result.value.url });
  return result.value.url;
}

async function run(
  browser: BrowserAPI,
  secrets: VaultSecrets,
  deps: StepRunnerDeps,
): Promise<TaskResultSuccess> {
  const { email, password } = loginSecretsSchema.parse(secrets);
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
    lastCompletedStep: FINAL_STEP,
    finalUrl,
  };
}

export const task: RetryingTask = {
  name: TASK.name,
  displayUrl: TASK.displayUrl,
  project: "monitor-botc",
  needs: needsFromSchema(loginSecretsSchema),
  mode: "retry",
  intervalMs: 300_000,
  secretsSchema: loginSecretsSchema,
  run,
};
