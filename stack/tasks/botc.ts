import { z } from "zod";
import type { Browser } from "../browser/browser.js";
import type { RetryingTask, TaskContext, TaskResultSuccess } from "../framework/tasks.js";
import { type TaskLogger, createTaskLogger } from "../framework/logging.js";
import { clickFirst, fillFirst, waitForFirst } from "./utils/selectors.js";
import { sleep } from "./utils/timing.js";
import { clickTurnstile } from "./utils/turnstile.js";

const contextSchema = z.object({
  SITE_EMAIL: z.string().min(1),
  SITE_PASSWORD: z.string().min(1),
});

const TASK = {
  name: "botcLogin",
  url: "https://botc.app/",
} as const;

const TIMINGS = {
  afterNav: 2000,
  afterSubmit: 2000,
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

async function navigate(browser: Browser, logger: TaskLogger): Promise<void> {
  await browser.navigate(TASK.url);
  await sleep(TIMINGS.afterNav);
  const { url, title } = await browser.getUrl();
  logger.success("navigate", "Navigated", { url, title });
}

async function findForm(browser: Browser, logger: TaskLogger): Promise<string> {
  const result = await waitForFirst(browser, SELECTORS.email, TIMINGS.waitEmail);
  if (result.found) {
    logger.success("findForm", "Found email input", {
      selector: result.selector,
    });
    return result.selector;
  }
  return logger.fail("findForm", "EMAIL_INPUT_NOT_FOUND", {
    details: `Selectors tried: ${SELECTORS.email.join(", ")}`,
  });
}

async function fillCreds(
  browser: Browser,
  logger: TaskLogger,
  emailSelector: string,
  email: string,
  password: string,
): Promise<void> {
  await browser.fill(emailSelector, email);

  const result = await fillFirst(browser, SELECTORS.password, password, TIMINGS.waitPassword);
  if (result.found) {
    logger.success("fillCreds", "Entered credentials");
    return;
  }
  logger.fail("fillCreds", "PASSWORD_INPUT_NOT_FOUND", {
    details: `Selectors tried: ${SELECTORS.password.join(", ")}`,
  });
}

async function turnstile(
  browser: Browser,
  logger: TaskLogger,
  phase: "pre" | "post",
): Promise<void> {
  await sleep(phase === "pre" ? TIMINGS.beforeTurnstile : TIMINGS.afterSubmit);

  const result = await clickTurnstile(browser);
  if (result.found) {
    logger.success("turnstile", `Clicked (${phase}-submit)`, {
      selector: result.selector,
    });
    await sleep(TIMINGS.afterTurnstile);
  } else {
    logger.success("turnstile", `None found (${phase}-submit)`);
  }
}

async function submit(browser: Browser, logger: TaskLogger): Promise<void> {
  const result = await clickFirst(browser, SELECTORS.submit);
  if (result.found) {
    logger.success("submit", "Submitted", { selector: result.selector });
    return;
  }
  logger.fail("submit", "SUBMIT_NOT_FOUND", {
    details: `Selectors tried: ${SELECTORS.submit.join(", ")}. Errors: ${result.error ?? "none"}`,
  });
}

async function checkResult(browser: Browser, logger: TaskLogger): Promise<string> {
  await sleep(TIMINGS.afterSubmit);
  const { url: finalUrl } = await browser.getUrl();

  if (finalUrl.toLowerCase().includes("login")) {
    logger.fail("checkResult", "STILL_ON_LOGIN_PAGE", { finalUrl });
  }
  logger.success("checkResult", "Login successful", { finalUrl });
  return finalUrl;
}

async function run(browser: Browser, context: TaskContext): Promise<TaskResultSuccess> {
  const { SITE_EMAIL: email, SITE_PASSWORD: password } = contextSchema.parse(context);
  const logger = createTaskLogger(TASK.name);

  await navigate(browser, logger);
  const emailSelector = await findForm(browser, logger);
  await fillCreds(browser, logger, emailSelector, email, password);
  await turnstile(browser, logger, "pre");
  await submit(browser, logger);
  await turnstile(browser, logger, "post");
  const finalUrl = await checkResult(browser, logger);

  return {
    ok: true,
    step: "checkResult",
    finalUrl,
    context: { task: TASK.name },
  };
}

export const botcLoginTask: RetryingTask = {
  name: TASK.name,
  url: TASK.url,
  mode: "retry",
  intervalMs: 300_000,
  contextSchema,
  run,
};
