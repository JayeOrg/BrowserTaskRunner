import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import { writeFileSync, mkdirSync } from 'fs';

const LOGIN_URL = process.env.BOTC_LOGIN_URL || 'https://botc.app/';
const EMAIL = process.env.BOTC_EMAIL;
const PASSWORD = process.env.BOTC_PASSWORD;
const WS_PORT = 8765;
const CHECK_INTERVAL_MS = Number.parseInt(process.env.BOTC_CHECK_INTERVAL_MS || '300000', 10);

if (!EMAIL || !PASSWORD) {
  console.error('Missing BOTC_EMAIL or BOTC_PASSWORD environment variables.');
  process.exit(1);
}

interface CommandMessage {
  type: string;
  url?: string;
  selector?: string;
  value?: string;
  timeout?: number;
}

interface ResponseMessage {
  id?: number;
  type?: string;
  error?: string;
  url?: string;
  title?: string;
  found?: boolean;
  content?: string;
  selector?: string;
  iframes?: unknown[];
  cfElements?: unknown[];
  buttons?: unknown[];
  iframeInfo?: unknown[];
}

interface PendingCommand {
  resolve: (value: ResponseMessage) => void;
  reject: (reason: Error) => void;
}

class ExtensionController {
  private port: number;
  private ws: WebSocket | null = null;
  private server: WebSocketServer | null = null;
  private pendingCommands: Map<number, PendingCommand> = new Map();
  private commandId = 0;

  constructor(port: number) {
    this.port = port;
  }

  start(): Promise<void> {
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
        console.log(`   ${process.cwd()}/stack/extension/extension`);
        console.log('6. Open a new tab (extension needs an active tab)');
        console.log('='.repeat(50));
        console.log('');
      });

      this.server.on('connection', (ws: WebSocket) => {
        console.log('[Server] Extension connected!');
        this.ws = ws;

        ws.on('message', (data: Buffer) => {
          try {
            const message: ResponseMessage = JSON.parse(data.toString());

            if (message.type === 'ready') {
              console.log('[Server] Extension is ready');
              resolve();
              return;
            }

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

      this.server.on('error', (error: Error) => {
        console.error('[Server] Error:', error);
        reject(error);
      });

      setTimeout(() => {
        if (!this.ws) {
          reject(new Error('Extension did not connect within 60 seconds'));
        }
      }, 60000);
    });
  }

  send(command: CommandMessage): Promise<ResponseMessage> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('Extension not connected'));
        return;
      }

      const id = ++this.commandId;
      this.pendingCommands.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, ...command }));

      setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          reject(new Error(`Command timeout: ${command.type}`));
        }
      }, 30000);
    });
  }

  async navigate(url: string): Promise<ResponseMessage> {
    console.log(`[Command] Navigate to ${url}`);
    return this.send({ type: 'navigate', url });
  }

  async getUrl(): Promise<ResponseMessage> {
    return this.send({ type: 'getUrl' });
  }

  async fill(selector: string, value: string): Promise<ResponseMessage> {
    console.log(`[Command] Fill ${selector}`);
    return this.send({ type: 'fill', selector, value });
  }

  async click(selector: string): Promise<ResponseMessage> {
    console.log(`[Command] Click ${selector}`);
    return this.send({ type: 'click', selector });
  }

  async clickTurnstile(): Promise<ResponseMessage> {
    console.log(`[Command] Click Cloudflare Turnstile`);
    return this.send({ type: 'clickTurnstile' });
  }

  async debugPage(): Promise<ResponseMessage> {
    console.log(`[Command] Debug page elements`);
    return this.send({ type: 'debugPage' });
  }

  async waitForSelector(selector: string, timeout = 10000): Promise<ResponseMessage> {
    console.log(`[Command] Wait for ${selector}`);
    return this.send({ type: 'waitForSelector', selector, timeout });
  }

  async getContent(selector: string | null = null): Promise<ResponseMessage> {
    return this.send({ type: 'getContent', selector: selector ?? undefined });
  }

  async ping(): Promise<ResponseMessage> {
    return this.send({ type: 'ping' });
  }

  close(): void {
    if (this.server) {
      this.server.close();
    }
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function attemptLogin(controller: ExtensionController): Promise<boolean> {
  console.log('\n[1/5] Navigating to login page...');
  await controller.navigate(LOGIN_URL);
  await sleep(2000);

  const urlInfo = await controller.getUrl();
  console.log(`[1/5] Current URL: ${urlInfo.url}`);
  console.log(`[1/5] Page title: ${urlInfo.title}`);

  console.log('\n[2/5] Waiting for login form...');
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input#email',
  ];

  let emailSelector: string | null = null;
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
    const content = await controller.getContent(null);
    console.log('[2/5] Page preview:', content.content?.substring(0, 200));
    return false;
  }

  console.log('\n[3/5] Filling credentials...');
  await controller.fill(emailSelector, EMAIL!);
  console.log('[3/5] Email entered');

  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input#password',
  ];

  for (const selector of passwordSelectors) {
    const result = await controller.waitForSelector(selector, 5000);
    if (result.found) {
      await controller.fill(selector, PASSWORD!);
      console.log('[3/5] Password entered');
      break;
    }
  }

  console.log('\n[4/7] Analyzing page elements...');
  const debugInfo = await controller.debugPage();
  if (debugInfo.iframes && debugInfo.iframes.length > 0) {
    console.log('[4/7] Iframes found:', JSON.stringify(debugInfo.iframes, null, 2));
  }
  if (debugInfo.cfElements && debugInfo.cfElements.length > 0) {
    console.log('[4/7] Cloudflare elements:', JSON.stringify(debugInfo.cfElements, null, 2));
  }
  console.log('[4/7] Buttons:', JSON.stringify(debugInfo.buttons?.slice(0, 5), null, 2));

  console.log('\n[5/7] Checking for Cloudflare Turnstile (pre-submit)...');
  await sleep(1000);
  let turnstileResult = await controller.clickTurnstile();
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
      await controller.click(selector);
      console.log('[6/7] Clicked submit button');
      break;
    } catch {
      // Try next selector
    }
  }

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

  console.log('\n[7/7] Checking result...');
  const finalUrl = await controller.getUrl();
  console.log(`[7/7] Final URL: ${finalUrl.url}`);

  const isSuccess = !finalUrl.url?.toLowerCase().includes('login');
  return isSuccess;
}

async function playAlert(): Promise<void> {
  process.stdout.write('\u0007');
  console.log('\n ALERT: Login successful!');

  try {
    mkdirSync('/app/docker/alerts', { recursive: true });
    const timestamp = new Date().toISOString();
    const alertContent = `LOGIN SUCCESSFUL!\nTime: ${timestamp}\nSite: ${LOGIN_URL}\n`;
    writeFileSync('/app/docker/alerts/LOGIN_SUCCESS.txt', alertContent);
    console.log(' Alert file written to /app/docker/alerts/LOGIN_SUCCESS.txt');
  } catch (err) {
    const error = err as Error;
    console.log('Could not write alert file:', error.message);
  }
}

async function run(): Promise<void> {
  const controller = new ExtensionController(WS_PORT);

  try {
    await controller.start();

    console.log('\n[Setup] Testing connection...');
    await controller.ping();
    console.log('[Setup] Extension connected and ready');

    let attempt = 0;
    while (true) {
      attempt++;
      console.log('\n' + '='.repeat(50));
      console.log(`ATTEMPT ${attempt} - ${new Date().toISOString()}`);
      console.log('='.repeat(50));

      try {
        const success = await attemptLogin(controller);

        if (success) {
          console.log('\n LOGIN SUCCESSFUL!');
          await playAlert();
          process.exit(0);
        }

        console.log('\n Login not successful yet');
      } catch (error) {
        const err = error as Error;
        console.error('\n Attempt failed:', err.message);
      }

      console.log(`\nWaiting ${Math.round(CHECK_INTERVAL_MS / 1000)} seconds before next attempt...`);
      await sleep(CHECK_INTERVAL_MS);
    }

  } catch (error) {
    const err = error as Error;
    console.error('\nFatal error:', err.message);
    process.exit(1);
  } finally {
    controller.close();
  }
}

run();
