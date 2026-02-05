import type { ExtensionHost } from '../../extension/host.js';
import type { Credentials, TaskConfig, TaskResult } from '../types.js';
import { clickFirst, fillFirst, waitForFirst } from '../utils/selectors.js';
import { fail, log, resetSteps, sleep, StepError } from '../utils/site-utils.js';
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

async function navigate(host: ExtensionHost) {
  log(TASK.name, 'navigate', 'Navigating', { url: TASK.url });
  await host.navigate(TASK.url);
  await sleep(TIMINGS.afterNav);
  const { url, title } = await host.getUrl();
  log(TASK.name, 'navigate', 'Done', { url: url ?? '?', title: title ?? '?' });
}

async function findForm(host: ExtensionHost) {
  log(TASK.name, 'findForm', 'Looking for email input');
  const result = await waitForFirst(host, SELECTORS.email, TIMINGS.waitEmail);
  if (result.found && result.selector) {
    log(TASK.name, 'findForm', 'Found', { selector: result.selector });
    return result.selector;
  }
  return fail(TASK.name, 'findForm', 'EMAIL_INPUT_NOT_FOUND', { details: `Selectors tried: ${SELECTORS.email.join(', ')}` });
}

async function fillCreds(host: ExtensionHost, creds: Credentials, emailSelector: string) {
  log(TASK.name, 'fillCreds', 'Entering credentials');
  await host.fill(emailSelector, creds.email);

  const result = await fillFirst(host, SELECTORS.password, creds.password, TIMINGS.waitPassword);
  if (result.found && result.selector) {
    log(TASK.name, 'fillCreds', 'Done', { selector: result.selector });
    return;
  }
  fail(TASK.name, 'fillCreds', 'PASSWORD_INPUT_NOT_FOUND', { details: `Selectors tried: ${SELECTORS.password.join(', ')}` });
}

async function turnstile(host: ExtensionHost, phase: 'pre' | 'post') {
  log(TASK.name, 'turnstile', `Checking (${phase}-submit)`);
  await sleep(phase === 'pre' ? TIMINGS.beforeTurnstile : TIMINGS.afterSubmit);

  const result = await clickTurnstile(host);
  if (result.found) {
    log(TASK.name, 'turnstile', 'Clicked', { selector: result.selector });
    await sleep(TIMINGS.afterTurnstile);
  } else {
    log(TASK.name, 'turnstile', 'None found');
  }
}

async function submit(host: ExtensionHost) {
  log(TASK.name, 'submit', 'Submitting');
  const result = await clickFirst(host, SELECTORS.submit);
  if (result.found && result.selector) {
    log(TASK.name, 'submit', 'Done', { selector: result.selector });
    return;
  }
  fail(TASK.name, 'submit', 'SUBMIT_NOT_FOUND', {
    details: `Selectors tried: ${SELECTORS.submit.join(', ')}. Errors: ${result.error ?? 'none'}`
  });
}

async function checkResult(host: ExtensionHost): Promise<string> {
  log(TASK.name, 'checkResult', 'Checking');
  await sleep(TIMINGS.afterSubmit);
  const { url } = await host.getUrl();
  const finalUrl = url ?? '';
  log(TASK.name, 'checkResult', 'Final URL', { finalUrl });

  if (finalUrl.toLowerCase().includes('login')) {
    fail(TASK.name, 'checkResult', 'STILL_ON_LOGIN_PAGE', { finalUrl });
  }
  return finalUrl;
}

async function attemptLogin(host: ExtensionHost, creds: Credentials): Promise<TaskResult> {
  resetSteps();
  try {
    await navigate(host);
    const emailSelector = await findForm(host);
    await fillCreds(host, creds, emailSelector);
    await turnstile(host, 'pre');
    await submit(host);
    await turnstile(host, 'post');
    const finalUrl = await checkResult(host);

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
