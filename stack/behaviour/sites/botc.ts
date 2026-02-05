import type { ExtensionHost } from '../../extension/host.js';
import type {
  Credentials,
  TaskConfig,
  LoginResult,
  LoginFailReason,
  LoginResultFailure,
} from '../types.js';
import { createStepEnum } from '../step-helpers.js';
import {
  assertOk,
  createDebugCapture,
  createContextLoggers,
  createResultBuilders,
  isStepFailure,
  ok,
  sleep,
  type StepResult,
} from '../utils.js';

const TASK = {
  taskName: 'botcLogin',
  url: 'https://botc.app/',
} as const;

const TIMINGS = {
  pauseAfterNavMs: 2000,
  pausePostSubmitMs: 2000,
  pauseAfterTurnstileMs: 3000,
  preTurnstileDelayMs: 1000,
  waitEmailMs: 15_000,
  waitPasswordMs: 5_000,
} as const;

const STEP_NAMES = [
  'NAVIGATE',
  'FORM',
  'CREDS',
  'ANALYZE',
  'TURNSTILE_PRE',
  'SUBMIT',
  'RESULT',
] as const;

export type StepName = (typeof STEP_NAMES)[number];
// Step: runtime enum-like object for dot notation; StepName: its type-safe keys.
// This allows single line edits of STEP_NAMES to update both the enum and its type.
const { Step, orderedSteps: ORDERED_STEPS } = createStepEnum(STEP_NAMES);

type StepFailureResult = LoginResultFailure & { step: StepName };

const BASE_CONTEXT = { task: TASK.taskName };

const DEBUG_LIMITS = {
  maxStringLength: 800,
  maxButtonEntries: 5,
} as const;

const { logWithContext, logJsonWithContext } = createContextLoggers(ORDERED_STEPS, BASE_CONTEXT);
const { failure, success } = createResultBuilders<StepName, LoginFailReason>({ baseContext: BASE_CONTEXT });

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

async function navigateToLoginPage(host: ExtensionHost): Promise<void> {
  logWithContext(Step.NAVIGATE, 'Navigating to login page...', { targetUrl: TASK.url });
  await host.navigate(TASK.url);
  await sleep(TIMINGS.pauseAfterNavMs);

  const urlInfo = await host.getUrl();
  const currentUrl = urlInfo.url ?? '<unknown>';
  const currentTitle = urlInfo.title ?? '<unknown>';
  logWithContext(Step.NAVIGATE, 'Navigation settled', { currentUrl, currentTitle });
}

async function waitForLoginForm(host: ExtensionHost): Promise<StepResult<string, StepFailureResult>> {
  logWithContext(Step.FORM, 'Waiting for login form...', { selectorsTried: SELECTORS.email });

  for (const selector of SELECTORS.email) {
    const result = await host.waitForSelector(selector, TIMINGS.waitEmailMs);
    if (result.found) {
      logWithContext(Step.FORM, 'Found email input', { selector });
      return ok(selector);
    }
  }

  logWithContext(Step.FORM, 'Email input not found - site may be down or blocked', {
    selectorsTried: SELECTORS.email,
    timeoutMs: TIMINGS.waitEmailMs,
  });
  const content = await host.getContent(null);
  logJsonWithContext(
    Step.FORM,
    'Page preview',
    createDebugCapture(Step.FORM, content.content?.substring(0, 200) ?? '<no content>'),
  );
  return failure(Step.FORM, 'EMAIL_INPUT_NOT_FOUND', 'Email field missing');
}

async function fillCredentials(
  host: ExtensionHost,
  creds: Credentials,
  emailSelector: string,
): Promise<StepResult<void, StepFailureResult>> {
  logWithContext(Step.CREDS, 'Filling credentials...');
  await host.fill(emailSelector, creds.email);
  logWithContext(Step.CREDS, 'Email entered');

  for (const selector of SELECTORS.password) {
    const result = await host.waitForSelector(selector, TIMINGS.waitPasswordMs);
    if (result.found) {
      await host.fill(selector, creds.password);
      logWithContext(Step.CREDS, 'Password entered', { selector });
      return ok(undefined);
    }
  }

  logWithContext(Step.CREDS, 'Password input not found - aborting attempt', {
    selectorsTried: SELECTORS.password,
    timeoutMs: TIMINGS.waitPasswordMs,
  });
  return failure(Step.CREDS, 'PASSWORD_INPUT_NOT_FOUND');
}

async function logPageDebugSnapshot(host: ExtensionHost): Promise<void> {
  logWithContext(Step.ANALYZE, 'Capturing page debug snapshot...');
  const debugInfo = await host.debugPage();
  const capture = createDebugCapture(
    Step.ANALYZE,
    {
      iframes: debugInfo.iframes,
      cfElements: debugInfo.cfElements,
      buttons: debugInfo.buttons?.slice(0, DEBUG_LIMITS.maxButtonEntries),
    },
    { maxStringLength: DEBUG_LIMITS.maxStringLength },
  );
  logJsonWithContext(Step.ANALYZE, 'Page debug snapshot', capture);
}

async function handlePreSubmitTurnstile(host: ExtensionHost): Promise<void> {
  logWithContext(Step.TURNSTILE_PRE, 'Checking for Cloudflare Turnstile (pre-submit)...');
  await sleep(TIMINGS.preTurnstileDelayMs);
  const turnstileResult = await host.clickTurnstile();
  if (turnstileResult.found) {
    const turnstileSelector = turnstileResult.selector ?? '(unknown selector)';
    logWithContext(Step.TURNSTILE_PRE, 'Clicked Turnstile widget', { turnstileSelector });
    await sleep(TIMINGS.pauseAfterTurnstileMs);
  } else {
    logWithContext(Step.TURNSTILE_PRE, 'No Turnstile widget found before submit');
    const capture = createDebugCapture(Step.TURNSTILE_PRE, turnstileResult, {
      maxStringLength: DEBUG_LIMITS.maxStringLength,
    });
    logJsonWithContext(Step.TURNSTILE_PRE, 'Turnstile pre-submit capture', capture);
  }
}

async function submitLoginForm(host: ExtensionHost): Promise<StepResult<void, StepFailureResult>> {
  logWithContext(Step.SUBMIT, 'Submitting form...', { selectorsTried: SELECTORS.submit });
  for (const selector of SELECTORS.submit) {
    try {
      await host.click(selector);
      logWithContext(Step.SUBMIT, 'Clicked submit button', { selector });
      return ok(undefined);
    } catch {
      // Try next selector
    }
  }

  logWithContext(Step.SUBMIT, 'Submit button not found - aborting attempt', { selectorsTried: SELECTORS.submit });
  return failure(Step.SUBMIT, 'SUBMIT_NOT_FOUND');
}

async function handlePostSubmitTurnstile(host: ExtensionHost): Promise<void> {
  await sleep(TIMINGS.pausePostSubmitMs);
  logWithContext(Step.SUBMIT, 'Checking for post-submit Cloudflare challenge...');
  const turnstileResult = await host.clickTurnstile();
  if (turnstileResult.found) {
    const postSubmitSelector = turnstileResult.selector ?? '(unknown selector)';
    logWithContext(Step.SUBMIT, 'Clicked post-submit Turnstile', { postSubmitSelector });
    await sleep(TIMINGS.pauseAfterTurnstileMs);
  } else {
    logWithContext(Step.SUBMIT, 'No post-submit challenge found');
    const capture = createDebugCapture(Step.SUBMIT, turnstileResult, {
      maxStringLength: DEBUG_LIMITS.maxStringLength,
    });
    logJsonWithContext(Step.SUBMIT, 'Turnstile post-submit capture', capture);
  }
  await sleep(TIMINGS.pausePostSubmitMs);
}

async function evaluateLoginResult(host: ExtensionHost): Promise<LoginResult> {
  logWithContext(Step.RESULT, 'Checking result...');
  const finalUrl = await host.getUrl();
  const finalUrlString = finalUrl.url ?? '';
  logWithContext(Step.RESULT, 'Final URL', { finalUrl: finalUrlString });

  const isSuccess = !finalUrlString.toLowerCase().includes('login');
  return isSuccess
    ? success(Step.RESULT, finalUrlString)
    : failure(Step.RESULT, 'STILL_ON_LOGIN_PAGE', undefined, finalUrlString);
}

async function attemptLogin(host: ExtensionHost, creds: Credentials): Promise<LoginResult> {
  try {
    await navigateToLoginPage(host);

    const formResult = await waitForLoginForm(host);
    assertOk(Step.FORM, ORDERED_STEPS, formResult, BASE_CONTEXT);
    const emailSelector = formResult.value;

    const credsResult = await fillCredentials(host, creds, emailSelector);
    assertOk(Step.CREDS, ORDERED_STEPS, credsResult, BASE_CONTEXT);

    await logPageDebugSnapshot(host);
    await handlePreSubmitTurnstile(host);

    const submitResult = await submitLoginForm(host);
    assertOk(Step.SUBMIT, ORDERED_STEPS, submitResult, BASE_CONTEXT);

    await handlePostSubmitTurnstile(host);
    return await evaluateLoginResult(host);
  } catch (error) {
    if (isStepFailure<StepFailureResult, StepName>(error)) {
      return error.result;
    }
    throw error;
  }
}

export const botcLoginTask: TaskConfig = {
  name: TASK.taskName,
  url: TASK.url,
  run: attemptLogin,
};
