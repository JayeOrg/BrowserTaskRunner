import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { writeFileSync, mkdirSync } from 'fs';

const LOGIN_URL = process.env.BOTC_LOGIN_URL || 'https://botc.app/';
const EMAIL = process.env.BOTC_EMAIL;
const PASSWORD = process.env.BOTC_PASSWORD;
const WS_PORT = 8765;
const CHECK_INTERVAL_MS = Number.parseInt(process.env.BOTC_CHECK_INTERVAL_MS || '300000', 10); // 5 minutes default

if (!EMAIL || !PASSWORD) {
  console.error('Missing BOTC_EMAIL or BOTC_PASSWORD environment variables.');
  process.exit(1);
}

class ExtensionController {
  constructor(port) {
    this.port = port;
    this.ws = null;
    this.server = null;
    this.pendingCommands = new Map();
    this.commandId = 0;
    this.readyPromise = null;
    this.readyResolve = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({ port: this.port });

      this.server.on('listening', () => {
        console.log(`[Server] WebSocket server listening on port ${this.port}`);
        console.log('[Server] Waiting for Chrome extension to connect...');
        console.log('');
        console.log('='.repeat(50));
        console.log('INSTRUCTIONS:');
        console.log('1. Open Chrome');
        console.log('2. Go to chrome://extensions');
        console.log('3. Enable "Developer mode"');
        console.log('4. Click "Load unpacked"');
        console.log('5. Select the extension folder:');
        console.log(`   ${process.cwd()}/extension`);
        console.log('6. Open a new tab (extension needs an active tab)');
        console.log('='.repeat(50));
        console.log('');
      });

      this.server.on('connection', (ws) => {
        console.log('[Server] Extension connected!');
        this.ws = ws;

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());

            if (message.type === 'ready') {
              console.log('[Server] Extension is ready');
              if (this.readyResolve) {
                this.readyResolve();
              }
              resolve();
              return;
            }

            // Handle command response
            if (message.id !== undefined) {
              const pending = this.pendingCommands.get(message.id);
              if (pending) {
                this.pendingCommands.delete(message.id);
                if (message.error) {
                  pending.reject(new Error(message.error));
                } else {
                  pending.resolve(message);
                }
              }
            }
          } catch (error) {
            console.error('[Server] Error parsing message:', error);
          }
        });

        ws.on('close', () => {
          console.log('[Server] Extension disconnected');
          this.ws = null;
        });
      });

      this.server.on('error', (error) => {
        console.error('[Server] Error:', error);
        reject(error);
      });

      // Timeout if extension doesn't connect
      setTimeout(() => {
        if (!this.ws) {
          reject(new Error('Extension did not connect within 60 seconds'));
        }
      }, 60000);
    });
  }

  send(command) {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('Extension not connected'));
        return;
      }

      const id = ++this.commandId;
      this.pendingCommands.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, ...command }));

      // Timeout for command
      setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          reject(new Error(`Command timeout: ${command.type}`));
        }
      }, 30000);
    });
  }

  async navigate(url) {
    console.log(`[Command] Navigate to ${url}`);
    return this.send({ type: 'navigate', url });
  }

  async getUrl() {
    return this.send({ type: 'getUrl' });
  }

  async fill(selector, value) {
    console.log(`[Command] Fill ${selector}`);
    return this.send({ type: 'fill', selector, value });
  }

  async click(selector) {
    console.log(`[Command] Click ${selector}`);
    return this.send({ type: 'click', selector });
  }

  async clickTurnstile() {
    console.log(`[Command] Click Cloudflare Turnstile`);
    return this.send({ type: 'clickTurnstile' });
  }

  async debugPage() {
    console.log(`[Command] Debug page elements`);
    return this.send({ type: 'debugPage' });
  }

  async waitForSelector(selector, timeout = 10000) {
    console.log(`[Command] Wait for ${selector}`);
    return this.send({ type: 'waitForSelector', selector, timeout });
  }

  async getContent(selector = null) {
    return this.send({ type: 'getContent', selector });
  }

  async ping() {
    return this.send({ type: 'ping' });
  }

  close() {
    if (this.server) {
      this.server.close();
    }
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function attemptLogin(controller) {
  // Navigate to login page
  console.log('\n[1/5] Navigating to login page...');
  await controller.navigate(LOGIN_URL);
  await sleep(2000);

  const urlInfo = await controller.getUrl();
  console.log(`[1/5] Current URL: ${urlInfo.url}`);
  console.log(`[1/5] Page title: ${urlInfo.title}`);

  // Wait for email input
  console.log('\n[2/5] Waiting for login form...');
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input#email',
  ];

  let emailSelector = null;
  for (const selector of emailSelectors) {
    const result = await controller.waitForSelector(selector, 15000);
    if (result.found) {
      emailSelector = selector;
      console.log(`[2/5] Found email input: ${selector}`);
      break;
    }
  }

  if (!emailSelector) {
    console.log('[2/5] Email input not found - site may be down or blocked');
    const content = await controller.getContent();
    console.log('[2/5] Page preview:', content.content?.substring(0, 200));
    return false;
  }

  // Fill email
  console.log('\n[3/5] Filling credentials...');
  await controller.fill(emailSelector, EMAIL);
  console.log('[3/5] Email entered');

  // Fill password
  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input#password',
  ];

  for (const selector of passwordSelectors) {
    const result = await controller.waitForSelector(selector, 5000);
    if (result.found) {
      await controller.fill(selector, PASSWORD);
      console.log('[3/5] Password entered');
      break;
    }
  }

  // Debug: Check what's on the page
  console.log('\n[4/7] Analyzing page elements...');
  const debugInfo = await controller.debugPage();
  if (debugInfo.iframes?.length > 0) {
    console.log('[4/7] Iframes found:', JSON.stringify(debugInfo.iframes, null, 2));
  }
  if (debugInfo.cfElements?.length > 0) {
    console.log('[4/7] Cloudflare elements:', JSON.stringify(debugInfo.cfElements, null, 2));
  }
  console.log('[4/7] Buttons:', JSON.stringify(debugInfo.buttons?.slice(0, 5), null, 2));

  // Handle Cloudflare Turnstile if present (before submit)
  console.log('\n[5/7] Checking for Cloudflare Turnstile (pre-submit)...');
  await sleep(1000); // Give Turnstile time to load
  let turnstileResult = await controller.clickTurnstile();
  if (turnstileResult.found) {
    console.log(`[5/7] Clicked Turnstile widget: ${turnstileResult.selector}`);
    // Wait for Turnstile to process
    await sleep(3000);
  } else {
    console.log('[5/7] No Turnstile widget found before submit');
    if (turnstileResult.iframeInfo?.length > 0) {
      console.log('[5/7] Iframes on page:', JSON.stringify(turnstileResult.iframeInfo, null, 2));
    }
  }

  // Click submit
  console.log('\n[6/7] Submitting form...');
  const submitSelectors = [
    'button[type="submit"]',
    'button:contains("Log in")',
    'button:contains("Sign in")',
    'input[type="submit"]',
  ];

  for (const selector of submitSelectors) {
    try {
      await controller.click(selector);
      console.log('[6/7] Clicked submit button');
      break;
    } catch (e) {
      // Try next selector
    }
  }

  // Wait and check for post-submit Cloudflare challenge
  await sleep(2000);
  console.log('\n[6/7] Checking for post-submit Cloudflare challenge...');
  turnstileResult = await controller.clickTurnstile();
  if (turnstileResult.found) {
    console.log(`[6/7] Clicked post-submit Turnstile: ${turnstileResult.selector}`);
    await sleep(3000);
  } else {
    console.log('[6/7] No post-submit challenge found');
  }

  await sleep(2000);

  // Check result
  console.log('\n[7/7] Checking result...');
  const finalUrl = await controller.getUrl();
  console.log(`[7/7] Final URL: ${finalUrl.url}`);

  const isSuccess = !finalUrl.url.toLowerCase().includes('login');
  return isSuccess;
}

async function playAlert() {
  // Terminal bell
  process.stdout.write('\u0007');
  console.log('\n🔔 ALERT: Login successful!');

  // Write alert file to mounted volume (visible in host workspace)
  try {
    mkdirSync('/app/alerts', { recursive: true });
    const timestamp = new Date().toISOString();
    const alertContent = `LOGIN SUCCESSFUL!\nTime: ${timestamp}\nSite: ${LOGIN_URL}\n`;
    writeFileSync('/app/alerts/LOGIN_SUCCESS.txt', alertContent);
    console.log('📄 Alert file written to /app/alerts/LOGIN_SUCCESS.txt');
  } catch (err) {
    console.log('Could not write alert file:', err.message);
  }
}

async function run() {
  const controller = new ExtensionController(WS_PORT);

  try {
    // Start server and wait for extension
    await controller.start();

    // Verify connection
    console.log('\n[Setup] Testing connection...');
    await controller.ping();
    console.log('[Setup] Extension connected and ready');

    // Retry loop
    let attempt = 0;
    while (true) {
      attempt++;
      console.log('\n' + '='.repeat(50));
      console.log(`ATTEMPT ${attempt} - ${new Date().toISOString()}`);
      console.log('='.repeat(50));

      try {
        const success = await attemptLogin(controller);

        if (success) {
          console.log('\n✅ LOGIN SUCCESSFUL!');
          await playAlert();
          process.exit(0);
        }

        console.log('\n❌ Login not successful yet');
      } catch (error) {
        console.error('\n❌ Attempt failed:', error.message);
      }

      console.log(`\nWaiting ${Math.round(CHECK_INTERVAL_MS / 1000)} seconds before next attempt...`);
      await sleep(CHECK_INTERVAL_MS);
    }

  } catch (error) {
    console.error('\nFatal error:', error.message);
    process.exit(1);
  } finally {
    controller.close();
  }
}

run();
