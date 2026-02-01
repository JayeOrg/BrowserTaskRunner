import 'dotenv/config';
import { chromium } from 'playwright';

const LOGIN_URL = process.env.BOTC_LOGIN_URL || 'https://botc.app/';
const EMAIL = process.env.BOTC_EMAIL;
const PASSWORD = process.env.BOTC_PASSWORD;
const SUCCESS_SELECTOR = process.env.BOTC_SUCCESS_SELECTOR;
const HEADLESS = !['0', 'false', 'no'].includes(
  (process.env.BOTC_HEADLESS || 'true').toLowerCase(),
);
const CHECK_INTERVAL_MS = Number.parseInt(process.env.BOTC_CHECK_INTERVAL_MS || '300000', 10);

if (!EMAIL || !PASSWORD) {
  console.error('Missing BOTC_EMAIL or BOTC_PASSWORD environment variables.');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const emailInput = page.locator('input[type="email"], input[name="email"], input#email').first();
  const passwordInput = page.locator('input[type="password"], input[name="password"], input#password').first();
  const submitButton = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")').first();

  await emailInput.fill(EMAIL);
  await passwordInput.fill(PASSWORD);
  await Promise.all([
    submitButton.click(),
    page.waitForLoadState('domcontentloaded'),
  ]);
}

async function run() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
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
