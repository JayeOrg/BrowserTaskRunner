import type { ExtensionHost } from '../../extension/host.js';
import type {
  Credentials,
  TaskConfig,
  LoginResult,
  LoginFailReason,
  LoginResultFailure,
  LoginResultSuccess,
} from '../types.js';
import { logJson, logStep, sleep } from '../utils.js';

const CONFIG = {
  taskName: 'botcLogin',
  url: 'https://botc.app/',
  pauseAfterNavMs: 2000,
  pausePostSubmitMs: 2000,
  pauseAfterTurnstileMs: 3000,
  preTurnstileDelayMs: 1000,
} as const;

const ORDERED_STEPS = [
  'NAVIGATE',
  'FORM',
  'CREDS',
  'ANALYZE',
  'TURNSTILE_PRE',
  'SUBMIT',
  'RESULT',
] as const;

const SELECTORS = {
  email: ['input[type="email"]', 'input[name="email"]', 'input#email'],
  password: ['input[type="password"]', 'input[name="password"]', 'input#password'],
  submit: [
    'button[type="submit"]',
    'button:contains("Log in")',
    'button:contains("Sign in")',
    'input[type="submit"]',
  ],
} as const;

type StepResult<T> = { ok: true; value: T } | LoginResultFailure;

function ok<T>(value: T): StepResult<T> {
  return { ok: true, value };
}

function failure(reason: LoginFailReason, details?: string, finalUrl?: string): LoginResultFailure {
  const result: LoginResultFailure = { ok: false, reason };
  if (details) {
    result.details = details;
  }
  if (finalUrl) {
    result.finalUrl = finalUrl;
  }
  return result;
}

function success(finalUrl?: string): LoginResultSuccess {
  const result: LoginResultSuccess = { ok: true };
  if (finalUrl) {
    result.finalUrl = finalUrl;
  }
  return result;
}

async function navigateToLoginPage(host: ExtensionHost): Promise<void> {
  logStep('NAVIGATE', ORDERED_STEPS, 'Navigating to login page...');
  await host.navigate(CONFIG.url);
  await sleep(CONFIG.pauseAfterNavMs);

  const urlInfo = await host.getUrl();
  const currentUrl = urlInfo.url ?? '<unknown>';
  const currentTitle = urlInfo.title ?? '<unknown>';
  logStep('NAVIGATE', ORDERED_STEPS, `Current URL: ${currentUrl}`);
  logStep('NAVIGATE', ORDERED_STEPS, `Page title: ${currentTitle}`);
}

async function waitForLoginForm(host: ExtensionHost): Promise<StepResult<string>> {
  logStep('FORM', ORDERED_STEPS, 'Waiting for login form...');

  for (const selector of SELECTORS.email) {
    const result = await host.waitForSelector(selector, 15000);
    if (result.found) {
      logStep('FORM', ORDERED_STEPS, `Found email input: ${selector}`);
      return ok(selector);
    }
  }

  logStep('FORM', ORDERED_STEPS, 'Email input not found - site may be down or blocked');
  const content = await host.getContent(null);
  logJson('FORM', ORDERED_STEPS, 'Page preview', content.content?.substring(0, 200));
  return failure('EMAIL_INPUT_NOT_FOUND', 'Email field missing');
}

async function fillCredentials(host: ExtensionHost, creds: Credentials, emailSelector: string): Promise<StepResult<void>> {
  logStep('CREDS', ORDERED_STEPS, 'Filling credentials...');
  await host.fill(emailSelector, creds.email);
  logStep('CREDS', ORDERED_STEPS, 'Email entered');

  for (const selector of SELECTORS.password) {
    const result = await host.waitForSelector(selector, 5000);
    if (result.found) {
      await host.fill(selector, creds.password);
      logStep('CREDS', ORDERED_STEPS, 'Password entered');
      return ok(undefined);
    }
  }

  logStep('CREDS', ORDERED_STEPS, 'Password input not found - aborting attempt');
  return failure('PASSWORD_INPUT_NOT_FOUND');
}

async function analyzePageElements(host: ExtensionHost): Promise<void> {
  logStep('ANALYZE', ORDERED_STEPS, 'Analyzing page elements...');
  const debugInfo = await host.debugPage();
  if (debugInfo.iframes && debugInfo.iframes.length > 0) {
    logJson('ANALYZE', ORDERED_STEPS, 'Iframes found', debugInfo.iframes);
  }
  if (debugInfo.cfElements && debugInfo.cfElements.length > 0) {
    logJson('ANALYZE', ORDERED_STEPS, 'Cloudflare elements', debugInfo.cfElements);
  }
  logJson('ANALYZE', ORDERED_STEPS, 'Buttons', debugInfo.buttons?.slice(0, 5));
}

async function handlePreSubmitTurnstile(host: ExtensionHost): Promise<void> {
  logStep('TURNSTILE_PRE', ORDERED_STEPS, 'Checking for Cloudflare Turnstile (pre-submit)...');
  await sleep(CONFIG.preTurnstileDelayMs);
  const turnstileResult = await host.clickTurnstile();
  if (turnstileResult.found) {
    const turnstileSelector = turnstileResult.selector ?? '(unknown selector)';
    logStep('TURNSTILE_PRE', ORDERED_STEPS, `Clicked Turnstile widget: ${turnstileSelector}`);
    await sleep(CONFIG.pauseAfterTurnstileMs);
  } else {
    logStep('TURNSTILE_PRE', ORDERED_STEPS, 'No Turnstile widget found before submit');
    if (turnstileResult.iframeInfo && turnstileResult.iframeInfo.length > 0) {
      logJson('TURNSTILE_PRE', ORDERED_STEPS, 'Iframes on page', turnstileResult.iframeInfo);
    }
  }
}

async function submitLoginForm(host: ExtensionHost): Promise<StepResult<void>> {
  logStep('SUBMIT', ORDERED_STEPS, 'Submitting form...');
  for (const selector of SELECTORS.submit) {
    try {
      await host.click(selector);
      logStep('SUBMIT', ORDERED_STEPS, 'Clicked submit button');
      return ok(undefined);
    } catch {
      // Try next selector
    }
  }

  logStep('SUBMIT', ORDERED_STEPS, 'Submit button not found - aborting attempt');
  return failure('SUBMIT_NOT_FOUND');
}

async function handlePostSubmitTurnstile(host: ExtensionHost): Promise<void> {
  await sleep(CONFIG.pausePostSubmitMs);
  logStep('SUBMIT', ORDERED_STEPS, 'Checking for post-submit Cloudflare challenge...');
  const turnstileResult = await host.clickTurnstile();
  if (turnstileResult.found) {
    const postSubmitSelector = turnstileResult.selector ?? '(unknown selector)';
    logStep('SUBMIT', ORDERED_STEPS, `Clicked post-submit Turnstile: ${postSubmitSelector}`);
    await sleep(CONFIG.pauseAfterTurnstileMs);
  } else {
    logStep('SUBMIT', ORDERED_STEPS, 'No post-submit challenge found');
  }
  await sleep(CONFIG.pausePostSubmitMs);
}

async function evaluateLoginResult(host: ExtensionHost): Promise<LoginResult> {
  logStep('RESULT', ORDERED_STEPS, 'Checking result...');
  const finalUrl = await host.getUrl();
  const finalUrlString = finalUrl.url ?? '';
  logStep('RESULT', ORDERED_STEPS, `Final URL: ${finalUrlString}`);

  const isSuccess = !finalUrlString.toLowerCase().includes('login');
  return isSuccess
    ? success(finalUrlString)
    : failure('STILL_ON_LOGIN_PAGE', undefined, finalUrlString);
}

async function attemptLogin(host: ExtensionHost, creds: Credentials): Promise<LoginResult> {
  await navigateToLoginPage(host);

  const formResult = await waitForLoginForm(host);
  if (!formResult.ok) {return formResult;}

  const credsResult = await fillCredentials(host, creds, formResult.value);
  if (!credsResult.ok) {return credsResult;}

  await analyzePageElements(host);
  await handlePreSubmitTurnstile(host);

  const submitResult = await submitLoginForm(host);
  if (!submitResult.ok) {return submitResult;}

  await handlePostSubmitTurnstile(host);
  return evaluateLoginResult(host);
}

export const botcLoginTask: TaskConfig = {
  name: CONFIG.taskName,
  url: CONFIG.url,
  run: attemptLogin,
};
