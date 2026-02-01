import 'dotenv/config';
import { chromium } from 'playwright';

const LOGIN_URL = process.env.BOTC_LOGIN_URL || 'https://botc.app/';
const EMAIL = process.env.BOTC_EMAIL;
const PASSWORD = process.env.BOTC_PASSWORD;
const SUCCESS_SELECTOR = process.env.BOTC_SUCCESS_SELECTOR;
const USER_AGENT =
  process.env.BOTC_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
const HEADLESS = !['0', 'false', 'no'].includes(
  (process.env.BOTC_HEADLESS || 'true').toLowerCase(),
);
const CHECK_INTERVAL_MS = Number.parseInt(process.env.BOTC_CHECK_INTERVAL_MS || '300000', 10);

if (!EMAIL || !PASSWORD) {
  console.error('Missing BOTC_EMAIL or BOTC_PASSWORD environment variables.');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function humanClick(page, locator) {
  const handle = await locator.elementHandle();
  if (!handle) {
    return false;
  }
  const box = await handle.boundingBox();
  if (!box) {
    return false;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - randomBetween(5, 20), y - randomBetween(5, 20));
  await page.mouse.move(x, y, { steps: randomBetween(12, 25) });
  await page.mouse.down();
  await page.waitForTimeout(randomBetween(80, 160));
  await page.mouse.up();
  return true;
}

async function handleCloudflareHumanVerification(page) {
  const challengeSelectors = [
    'iframe[title*="challenge"]',
    'iframe[title*="Turnstile"]',
    'iframe[src*="turnstile"]',
    'iframe[src*="challenge"]',
    'iframe[src*="cloudflare"]',
  ];
  const checkboxSelectors = [
    'input[type="checkbox"]',
    'div[role="checkbox"]',
    '.ctp-checkbox-container',
  ];

  for (const frameSelector of challengeSelectors) {
    const frameLocator = page.frameLocator(frameSelector);
    for (const checkboxSelector of checkboxSelectors) {
      const checkbox = frameLocator.locator(checkboxSelector).first();
      const visible = await checkbox.isVisible({ timeout: 1500 }).catch(() => false);
      if (!visible) {
        continue;
      }
      const clicked = await humanClick(page, checkbox);
      if (clicked) {
        await page.waitForTimeout(randomBetween(1500, 3000));
        return true;
      }
    }
  }
  return false;
}

async function playAlert(page) {
  try {
    await page.evaluate(() => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
      setTimeout(() => {
        oscillator.stop();
        ctx.close();
      }, 1200);
    });
  } catch (error) {
    process.stdout.write('\u0007');
    console.warn('Unable to play in-page alert, falling back to terminal bell.', error.message);
  }
}

async function isLoginSuccessful(page) {
  if (SUCCESS_SELECTOR) {
    return page.locator(SUCCESS_SELECTOR).first().isVisible({ timeout: 5000 }).catch(() => false);
  }

  const url = page.url();
  if (!url.toLowerCase().includes('login')) {
    return true;
  }

  const signOutLocator = page.locator('text=/log out|logout|sign out/i').first();
  return signOutLocator.isVisible({ timeout: 3000 }).catch(() => false);
}

async function attemptLogin(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await handleCloudflareHumanVerification(page);

  const emailInput = page.locator('input[type="email"], input[name="email"], input#email').first();
  const passwordInput = page.locator('input[type="password"], input[name="password"], input#password').first();
  const submitButton = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")').first();

  await emailInput.fill(EMAIL);
  await passwordInput.fill(PASSWORD);
  await Promise.all([
    submitButton.click(),
    page.waitForLoadState('domcontentloaded'),
  ]);
  await handleCloudflareHumanVerification(page);
}

async function run() {
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    viewport: { width: 1280, height: 720 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });
  const page = await context.newPage();

  try {
    while (true) {
      console.log(`Attempting login at ${new Date().toISOString()}`);
      try {
        await attemptLogin(page);
        const success = await isLoginSuccessful(page);
        if (success) {
          console.log('Login successful.');
          await playAlert(page);
          break;
        }
        console.log('Login not successful yet; will retry.');
      } catch (error) {
        console.error('Login attempt failed:', error.message);
      }

      console.log(`Waiting ${Math.round(CHECK_INTERVAL_MS / 1000)} seconds before retry.`);
      await sleep(CHECK_INTERVAL_MS);
    }
  } finally {
    await browser.close();
  }
}

run();
