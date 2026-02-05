import { ExtensionHost } from '../../extension/host.js';
import { Credentials, SiteLoginFlow } from '../types.js';

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function attemptLogin(host: ExtensionHost, creds: Credentials): Promise<boolean> {
  console.log('\n[1/7] Navigating to login page...');
  await host.navigate(creds.loginUrl);
  await sleep(2000);

  const urlInfo = await host.getUrl();
  console.log(`[1/7] Current URL: ${urlInfo.url}`);
  console.log(`[1/7] Page title: ${urlInfo.title}`);

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
    console.log(`[5/7] Clicked Turnstile widget: ${turnstileResult.selector}`);
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
    console.log(`[6/7] Clicked post-submit Turnstile: ${turnstileResult.selector}`);
    await sleep(3000);
  } else {
    console.log('[6/7] No post-submit challenge found');
  }

  await sleep(2000);

  console.log('\n[7/7] Checking result...');
  const finalUrl = await host.getUrl();
  console.log(`[7/7] Final URL: ${finalUrl.url}`);

  const isSuccess = !finalUrl.url?.toLowerCase().includes('login');
  return isSuccess;
}

export const botcLoginFlow: SiteLoginFlow = {
  name: 'botc',
  run: attemptLogin,
};

