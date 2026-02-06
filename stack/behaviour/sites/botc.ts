import type { ExtensionHost } from "../../extension/host.js";
import type { TaskConfig, TaskContext, TaskResult } from "../types.js";
import { StepError } from "../utils/errors.js";
import { createTaskLogger, type TaskLogger } from "../utils/logging.js";
import { clickFirst, fillFirst, waitForFirst } from "../utils/selectors.js";
import { sleep } from "../utils/timing.js";
import { clickTurnstile } from "../utils/turnstile.js";

// This task requires SITE_EMAIL and SITE_PASSWORD in context
interface LoginCredentials {
  email: string;
  password: string;
}

function extractCredentials(
  context: TaskContext,
  logger: TaskLogger,
): LoginCredentials {
  const email = context.SITE_EMAIL;
  const password = context.SITE_PASSWORD;

  if (!email || !password) {
    const missing = [
      !email && "SITE_EMAIL",
      !password && "SITE_PASSWORD",
    ].filter(Boolean);
    return logger.fail("config", "MISSING_CREDENTIALS", {
      details: `Missing: ${missing.join(", ")}`,
    });
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
  context: TaskContext,
): Promise<TaskResult> {
  const logger = createTaskLogger(TASK.name);

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

  async function fillCreds(creds: LoginCredentials, emailSelector: string) {
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

  try {
    const creds = extractCredentials(context, logger);
    await navigate();
    const emailSelector = await findForm();
    await fillCreds(creds, emailSelector);
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
  } catch (error) {
    if (error instanceof StepError) {
      return error.toResult();
    }
    throw error;
  }
}

export const botcLoginTask: TaskConfig = {
  name: TASK.name,
  url: TASK.url,
  run: attemptLogin,
};
