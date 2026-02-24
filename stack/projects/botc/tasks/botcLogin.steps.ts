import type { StepLogger } from "../../../framework/logging.js";
import type { BrowserAPI } from "../../../browser/browser.js";
import { clickFirst, fillFirst, LOGIN_SELECTORS } from "../../utils/selectors.js";
import { sleep } from "../../utils/timing.js";
import { detectAndClickTurnstile } from "../../utils/turnstile.js";
import { pollUntil } from "../../utils/poll.js";

const DISPLAY_URL = "https://botc.app/";

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

type Secrets = { email: string; password: string };

export async function navigate(log: StepLogger, browser: BrowserAPI): Promise<void> {
  await browser.navigate(DISPLAY_URL);
  await sleep(TIMINGS.afterNav);
  const { url, title } = await browser.getUrl();
  log.success("Navigated", { url, title });
}

export async function fillLogin(
  log: StepLogger,
  browser: BrowserAPI,
  secrets: Secrets,
): Promise<void> {
  const { email, password } = secrets;

  const emailResult = await fillFirst(browser, SELECTORS.email, email, TIMINGS.waitEmail);
  if (!emailResult.found)
    log.fatal("EMAIL_INPUT_NOT_FOUND", {
      summary: `Selectors tried: ${SELECTORS.email.join(", ")}`,
    });

  const passResult = await fillFirst(browser, SELECTORS.password, password, TIMINGS.waitPassword);
  if (!passResult.found)
    log.fatal("PASSWORD_INPUT_NOT_FOUND", {
      summary: `Selectors tried: ${SELECTORS.password.join(", ")}`,
    });
  log.success("Entered credentials");
}

export async function turnstileBeforeSubmit(log: StepLogger, browser: BrowserAPI): Promise<void> {
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
export async function submit(log: StepLogger, browser: BrowserAPI): Promise<void> {
  const result = await clickFirst(browser, SELECTORS.submit);
  if (result.found) {
    log.success("Submitted", { selector: result.selector });
    return;
  }
  const errorSummary = result.errors.map((re) => `${re.selector}: ${re.error}`).join("; ");
  log.fatal("SUBMIT_NOT_FOUND", { summary: `Selectors tried: ${errorSummary}` });
}

export async function checkResult(log: StepLogger, browser: BrowserAPI): Promise<void> {
  const result = await pollUntil(
    () => browser.getUrl(),
    ({ url }) => url.includes("/app") || url.includes("/home") || url.includes("/dashboard"),
    { timeoutMs: TIMINGS.waitResult, intervalMs: 2_000 },
  );
  if (!result.ok) {
    log.fatal("STILL_ON_LOGIN_PAGE");
  }
  log.success("Login successful", { finalUrl: result.value.url });
}
