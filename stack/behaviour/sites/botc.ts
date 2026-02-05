import type { ExtensionHost } from '../../extension/host.js';
import type { Credentials, TaskConfig, TaskResult } from '../types.js';
import { clickFirst, fillFirst, waitForFirst } from '../utils/selectors.js';
import { createTaskLogger, sleep, StepError, type TaskLogger } from '../utils/site-utils.js';
import { clickTurnstile } from '../utils/turnstile.js';

const TASK = {
  name: 'botcLogin',
  url: 'https://botc.app/'
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
  email: ['input[type="email"]', 'input[name="email"]', 'input#email'],
  password: ['input[type="password"]', 'input[name="password"]', 'input#password'],
  submit: ['button[type="submit"]', 'button:contains("Log in")', 'button:contains("Sign in")', 'input[type="submit"]'],
} as const;

async function navigate(host: ExtensionHost, logger: TaskLogger) {
  await host.navigate(TASK.url);
  await sleep(TIMINGS.afterNav);
  const { url, title } = await host.getUrl();
  logger.success('navigate', 'Navigated', { url: url ?? '?', title: title ?? '?' });
}

async function findForm(host: ExtensionHost, logger: TaskLogger) {
  const result = await waitForFirst(host, SELECTORS.email, TIMINGS.waitEmail);
  if (result.found && result.selector) {
    logger.success('findForm', 'Found email input', { selector: result.selector });
    return result.selector;
  }
  return logger.fail('findForm', 'EMAIL_INPUT_NOT_FOUND', { details: `Selectors tried: ${SELECTORS.email.join(', ')}` });
}

async function fillCreds(host: ExtensionHost, logger: TaskLogger, creds: Credentials, emailSelector: string) {
  await host.fill(emailSelector, creds.email);

  const result = await fillFirst(host, SELECTORS.password, creds.password, TIMINGS.waitPassword);
  if (result.found && result.selector) {
    logger.success('fillCreds', 'Entered credentials');
    return;
  }
  logger.fail('fillCreds', 'PASSWORD_INPUT_NOT_FOUND', { details: `Selectors tried: ${SELECTORS.password.join(', ')}` });
}

async function turnstile(host: ExtensionHost, logger: TaskLogger, phase: 'pre' | 'post') {
  await sleep(phase === 'pre' ? TIMINGS.beforeTurnstile : TIMINGS.afterSubmit);

  const result = await clickTurnstile(host);
  if (result.found) {
    logger.success('turnstile', `Clicked (${phase}-submit)`, { selector: result.selector });
    await sleep(TIMINGS.afterTurnstile);
  } else {
    logger.success('turnstile', `None found (${phase}-submit)`);
  }
}

async function submit(host: ExtensionHost, logger: TaskLogger) {
  const result = await clickFirst(host, SELECTORS.submit);
  if (result.found && result.selector) {
    logger.success('submit', 'Submitted', { selector: result.selector });
    return;
  }
  logger.fail('submit', 'SUBMIT_NOT_FOUND', {
    details: `Selectors tried: ${SELECTORS.submit.join(', ')}. Errors: ${result.error ?? 'none'}`
  });
}

async function checkResult(host: ExtensionHost, logger: TaskLogger): Promise<string> {
  await sleep(TIMINGS.afterSubmit);
  const { url } = await host.getUrl();
  const finalUrl = url ?? '';

  if (finalUrl.toLowerCase().includes('login')) {
    logger.fail('checkResult', 'STILL_ON_LOGIN_PAGE', { finalUrl });
  }
  logger.success('checkResult', 'Login successful', { finalUrl });
  return finalUrl;
}

async function attemptLogin(host: ExtensionHost, creds: Credentials): Promise<TaskResult> {
  const logger = createTaskLogger(TASK.name);

  try {
    await navigate(host, logger);
    const emailSelector = await findForm(host, logger);
    await fillCreds(host, logger, creds, emailSelector);
    await turnstile(host, logger, 'pre');
    await submit(host, logger);
    await turnstile(host, logger, 'post');
    const finalUrl = await checkResult(host, logger);

    return { ok: true, step: 'checkResult', finalUrl, context: { task: TASK.name } };
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
