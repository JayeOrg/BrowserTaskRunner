import type { ExtensionHost } from "../host/main.js";
import type { TaskConfig, TaskContext } from "../runner/tasks.js";
import {
  StepError,
  getErrorMessage,
  type TaskResultSuccess,
} from "../common/errors.js";
import { createTaskLogger, type TaskLogger } from "../common/logging.js";
import { clickFirst, fillFirst, waitForFirst } from "./utils/selectors.js";
import { sleep } from "./utils/timing.js";
import { clickTurnstile } from "./utils/turnstile.js";

interface LoginCredentials {
  email: string;
  password: string;
}

function extractCredentials(context: TaskContext): LoginCredentials {
  const email = context.SITE_EMAIL;
  const password = context.SITE_PASSWORD;

  if (!email || !password) {
    const missing = [
      !email && "SITE_EMAIL",
      !password && "SITE_PASSWORD",
    ].filter(Boolean);
    throw new Error(`Missing credentials: ${missing.join(", ")}`);
  }

  return { email, password };
}

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
  password: [
    'input[type="password"]',
    'input[name="password"]',
    "input#password",
  ],
  submit: [
    'button[type="submit"]',
    'button:contains("Log in")',
    'button:contains("Sign in")',
    'input[type="submit"]',
  ],
} as const;

async function attemptLogin(
  host: ExtensionHost,
  creds: LoginCredentials,
  logger: TaskLogger,
): Promise<TaskResultSuccess> {
  async function navigate() {
    await host.navigate(TASK.url);
    await sleep(TIMINGS.afterNav);
    const { url, title } = await host.getUrl();
    logger.success("navigate", "Navigated", { url, title });
  }

  async function findForm() {
    const result = await waitForFirst(host, SELECTORS.email, TIMINGS.waitEmail);
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

  async function fillCreds(emailSelector: string) {
    await host.fill(emailSelector, creds.email);

    const result = await fillFirst(
      host,
      SELECTORS.password,
      creds.password,
      TIMINGS.waitPassword,
    );
    if (result.found) {
      logger.success("fillCreds", "Entered credentials");
      return;
    }
    logger.fail("fillCreds", "PASSWORD_INPUT_NOT_FOUND", {
      details: `Selectors tried: ${SELECTORS.password.join(", ")}`,
    });
  }

  async function turnstile(phase: "pre" | "post") {
    await sleep(
      phase === "pre" ? TIMINGS.beforeTurnstile : TIMINGS.afterSubmit,
    );

    const result = await clickTurnstile(host);
    if (result.found) {
      logger.success("turnstile", `Clicked (${phase}-submit)`, {
        selector: result.selector,
      });
      await sleep(TIMINGS.afterTurnstile);
    } else {
      logger.success("turnstile", `None found (${phase}-submit)`);
    }
  }

  async function submit() {
    const result = await clickFirst(host, SELECTORS.submit);
    if (result.found) {
      logger.success("submit", "Submitted", { selector: result.selector });
      return;
    }
    logger.fail("submit", "SUBMIT_NOT_FOUND", {
      details: `Selectors tried: ${SELECTORS.submit.join(", ")}. Errors: ${result.error ?? "none"}`,
    });
  }

  async function checkResult(): Promise<string> {
    await sleep(TIMINGS.afterSubmit);
    const { url: finalUrl } = await host.getUrl();

    if (finalUrl.toLowerCase().includes("login")) {
      logger.fail("checkResult", "STILL_ON_LOGIN_PAGE", { finalUrl });
    }
    logger.success("checkResult", "Login successful", { finalUrl });
    return finalUrl;
  }

  await navigate();
  const emailSelector = await findForm();
  await fillCreds(emailSelector);
  await turnstile("pre");
  await submit();
  await turnstile("post");
  const finalUrl = await checkResult();

  return {
    ok: true,
    step: "checkResult",
    finalUrl,
    context: { task: TASK.name },
  };
}

async function run(
  host: ExtensionHost,
  context: TaskContext,
): Promise<TaskResultSuccess> {
  const creds = extractCredentials(context);
  const intervalMs = parseInt(context.SITE_CHECK_INTERVAL_MS || "300000", 10);

  let attempt = 0;
  while (true) {
    attempt++;
    const logger = createTaskLogger(TASK.name);
    logger.log("run", `Attempt ${attempt.toString()}`);

    try {
      return await attemptLogin(host, creds, logger);
    } catch (error) {
      if (error instanceof StepError) {
        logger.warn("retry", "Not successful yet");
      } else {
        logger.warn("retry", `Unexpected: ${getErrorMessage(error)}`);
      }
    }

    logger.log("retry", "Waiting before next attempt", {
      seconds: Math.round(intervalMs / 1000),
    });
    await sleep(intervalMs);
  }
}

export const botcLoginTask: TaskConfig = {
  name: TASK.name,
  url: TASK.url,
  run,
};
