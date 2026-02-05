import type { ExtensionHost } from '../../extension/host.js';
import type { Credentials, TaskConfig } from '../types.js';

const TASK_NAME = 'botcLogin';
const BOTC_LOGIN_URL = 'https://botc.app/';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms); });
}

async function attemptLogin(host: ExtensionHost, creds: Credentials): Promise<boolean> {
  console.log('\n[1/7] Navigating to login page...');
  await host.navigate(BOTC_LOGIN_URL);
  await sleep(2000);

  const urlInfo = await host.getUrl();
  const currentUrl = urlInfo.url ?? '<unknown>';
  const currentTitle = urlInfo.title ?? '<unknown>';
  console.log(`[1/7] Current URL: ${currentUrl}`);
  console.log(`[1/7] Page title: ${currentTitle}`);

  console.log('\n[2/7] Waiting for login form...');
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input#email',
  ];

  let emailSelector: string | null = null;
  for (const selector of emailSelectors) {
    const result = await host.waitForSelector(selector, 15000);
    if (result.found) {
      emailSelector = selector;
      console.log(`[2/7] Found email input: ${selector}`);
      break;
    }
  }

  if (!emailSelector) {
    console.log('[2/7] Email input not found - site may be down or blocked');
    const content = await host.getContent(null);
    console.log('[2/7] Page preview:', content.content?.substring(0, 200));
    return false;
  }

  console.log('\n[3/7] Filling credentials...');
  await host.fill(emailSelector, creds.email);
  console.log('[3/7] Email entered');

  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input#password',
  ];

  for (const selector of passwordSelectors) {
    const result = await host.waitForSelector(selector, 5000);
    if (result.found) {
      await host.fill(selector, creds.password);
      console.log('[3/7] Password entered');
      break;
    }
  }

  console.log('\n[4/7] Analyzing page elements...');
  const debugInfo = await host.debugPage();
  if (debugInfo.iframes && debugInfo.iframes.length > 0) {
    console.log('[4/7] Iframes found:', JSON.stringify(debugInfo.iframes, null, 2));
  }
  if (debugInfo.cfElements && debugInfo.cfElements.length > 0) {
    console.log('[4/7] Cloudflare elements:', JSON.stringify(debugInfo.cfElements, null, 2));
  }
  console.log('[4/7] Buttons:', JSON.stringify(debugInfo.buttons?.slice(0, 5), null, 2));

  console.log('\n[5/7] Checking for Cloudflare Turnstile (pre-submit)...');
  await sleep(1000);
  let turnstileResult = await host.clickTurnstile();
  if (turnstileResult.found) {
    const turnstileSelector = turnstileResult.selector ?? '(unknown selector)';
    console.log(`[5/7] Clicked Turnstile widget: ${turnstileSelector}`);
    await sleep(3000);
  } else {
    console.log('[5/7] No Turnstile widget found before submit');
    if (turnstileResult.iframeInfo && turnstileResult.iframeInfo.length > 0) {
      console.log('[5/7] Iframes on page:', JSON.stringify(turnstileResult.iframeInfo, null, 2));
    }
  }

  console.log('\n[6/7] Submitting form...');
  const submitSelectors = [
    'button[type="submit"]',
    'button:contains("Log in")',
    'button:contains("Sign in")',
    'input[type="submit"]',
  ];

  for (const selector of submitSelectors) {
    try {
      await host.click(selector);
      console.log('[6/7] Clicked submit button');
      break;
    } catch {
      // Try next selector
    }
  }

  await sleep(2000);
  console.log('\n[6/7] Checking for post-submit Cloudflare challenge...');
  turnstileResult = await host.clickTurnstile();
  if (turnstileResult.found) {
    const postSubmitSelector = turnstileResult.selector ?? '(unknown selector)';
    console.log(`[6/7] Clicked post-submit Turnstile: ${postSubmitSelector}`);
    await sleep(3000);
  } else {
    console.log('[6/7] No post-submit challenge found');
  }

  await sleep(2000);

  console.log('\n[7/7] Checking result...');
  const finalUrl = await host.getUrl();
  const finalUrlString = finalUrl.url ?? '';
  console.log(`[7/7] Final URL: ${finalUrlString}`);

  const isSuccess = !finalUrlString.toLowerCase().includes('login');
  return isSuccess;
}

export const botcLoginTask: TaskConfig = {
  name: TASK_NAME,
  url: BOTC_LOGIN_URL,
  run: attemptLogin,
};
