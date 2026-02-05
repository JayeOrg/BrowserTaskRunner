// WebSocket connection to Node.js server
let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const WS_URL = 'ws://localhost:8765';
const MAX_RECONNECT_DELAY_MS = 30000;
const BASE_RECONNECT_DELAY_MS = 1000;

interface CommandMessage {
  id?: number;
  type: string;
  url?: string;
  selector?: string;
  value?: string;
  timeout?: number;
  code?: string;
}

interface ResponseMessage {
  success?: boolean;
  error?: string;
  url?: string;
  title?: string;
  found?: boolean;
  content?: string;
  selector?: string;
  iframes?: IframeInfo[];
  cfElements?: ElementInfo[];
  buttons?: ButtonInfo[];
  iframeInfo?: IframeInfo[];
  clickX?: number;
  clickY?: number;
  containerRect?: { left: number; top: number; width: number; height: number };
  cdpClick?: boolean;
  cdpError?: string;
  pong?: boolean;
  result?: unknown;
  loaded?: boolean;
  timedOut?: boolean;
}

interface IframeInfo {
  src: string;
  id: string;
  className: string;
  width?: number;
  height?: number;
  rect?: { left: number; top: number; width: number; height: number };
}

interface ElementInfo {
  tag: string;
  id: string;
  className: string;
}

interface ButtonInfo {
  text: string | undefined;
  type: string;
  className: string;
  disabled: boolean;
}

interface TurnstileInfo extends ResponseMessage {
  found: boolean;
  clickX?: number;
  clickY?: number;
}

function getReconnectDelay(): number {
  const delay = Math.min(
    BASE_RECONNECT_DELAY_MS * (2 ** reconnectAttempts),
    MAX_RECONNECT_DELAY_MS
  );
  return delay;
}

function scheduleReconnect(): void {
  if (reconnectTimeout) {
    return;
  }
  const delay = getReconnectDelay();
  reconnectAttempts++;
  console.log(`[SiteCheck] Reconnecting in ${delay.toString()}ms (attempt ${reconnectAttempts.toString()})`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connect();
  }, delay);
}

function connect(): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return;
  }

  console.log('[SiteCheck] Connecting to', WS_URL);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[SiteCheck] Connected to server');
    reconnectAttempts = 0;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    ws?.send(JSON.stringify({ type: 'ready' }));
  };

  ws.onmessage = async (event: MessageEvent) => {
    let messageId: number | undefined;
    try {
      if (typeof event.data !== 'string') {
        throw new Error('Expected string message data');
      }
      const incoming: CommandMessage = JSON.parse(event.data);
      messageId = incoming.id;
      console.log('[SiteCheck] Received command:', incoming.type);
      const result = await handleCommand(incoming);
      ws?.send(JSON.stringify({ id: messageId, ...result }));
    } catch (error) {
      console.error('[SiteCheck] Error handling message:', error);
      const message = error instanceof Error ? error.message : String(error);
      ws?.send(JSON.stringify({ id: messageId, error: message }));
    }
  };

  ws.onclose = () => {
    console.log('[SiteCheck] Disconnected from server');
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = (error: Event) => {
    console.error('[SiteCheck] WebSocket error:', error);
  };
}

// --- Tab utilities ---

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error('No active tab');
  }
  return tab;
}

function getTabId(tab: chrome.tabs.Tab): number {
  if (tab.id === undefined) {
    throw new Error('Tab has no ID (possibly a devtools or extension tab)');
  }
  return tab.id;
}

interface TabLoadResult {
  loaded: boolean;
  timedOut: boolean;
}

function waitForTabLoad(tabId: number, timeoutMs = 30000): Promise<TabLoadResult> {
  return new Promise<TabLoadResult>((resolve) => {
    let resolved = false;

    const listener = (changedTabId: number, changeInfo: { status?: string }) => {
      if (changedTabId === tabId && changeInfo.status === 'complete' && !resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(() => { resolve({ loaded: true, timedOut: false }); }, 500);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        console.warn(`[SiteCheck] Tab load timed out after ${timeoutMs.toString()}ms`);
        resolve({ loaded: false, timedOut: true });
      }
    }, timeoutMs);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// --- Command handlers ---

async function handleNavigate(url: string): Promise<ResponseMessage> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  await chrome.tabs.update(tabId, { url });
  const loadResult = await waitForTabLoad(tabId);
  return { success: true, url, ...loadResult };
}

async function handleGetUrl(): Promise<ResponseMessage> {
  const tab = await getActiveTab();
  return { success: true, url: tab.url, title: tab.title };
}

/* eslint-disable @typescript-eslint/no-implied-eval, sonarjs/code-eval, no-new-func */
async function handleExecuteScript(code: string): Promise<ResponseMessage> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  // Dynamic code execution is the core purpose of this extension
  const dynamicFunc = new Function(code) as () => unknown;
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: dynamicFunc,
  });
  return { success: true, result: results[0]?.result };
}
/* eslint-enable @typescript-eslint/no-implied-eval, sonarjs/code-eval, no-new-func */

async function handleFill(selector: string, value: string): Promise<ResponseMessage> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string, val: string) => {
      const element = document.querySelector(sel);
      if (!element) {
        return { error: `Element not found: ${sel}` };
      }
      if (!(element instanceof HTMLInputElement)) {
        return { error: `Element is not an input: ${sel}` };
      }
      element.focus();
      element.value = val;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    },
    args: [selector, value],
  });
  const result = results[0]?.result as ResponseMessage | undefined;
  return result ?? { error: 'Script execution failed' };
}

async function handleClick(selector: string): Promise<ResponseMessage> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string) => {
      const element = document.querySelector(sel);
      if (!element) {
        return { error: `Element not found: ${sel}` };
      }

      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const eventOptions = {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        screenX: centerX + window.screenX,
        screenY: centerY + window.screenY,
        button: 0,
        buttons: 1,
      };

      element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
      element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
      element.dispatchEvent(new MouseEvent('click', eventOptions));

      return { success: true };
    },
    args: [selector],
  });
  const result = results[0]?.result as ResponseMessage | undefined;
  return result ?? { error: 'Script execution failed' };
}

async function handleClickTurnstile(): Promise<ResponseMessage> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const allIframes = Array.from(document.querySelectorAll('iframe'));
      const iframeInfo = allIframes.map(frame => ({
        src: frame.src,
        id: frame.id,
        className: frame.className,
        rect: {
          left: frame.getBoundingClientRect().left,
          top: frame.getBoundingClientRect().top,
          width: frame.getBoundingClientRect().width,
          height: frame.getBoundingClientRect().height,
        }
      }));

      const turnstileSelectors = [
        '.turnstile',
        '.cf-turnstile',
        '[data-turnstile-widget]',
        '#turnstile-wrapper',
        '[class*="turnstile"]',
      ];

      for (const selector of turnstileSelectors) {
        const container = document.querySelector(selector);
        if (container) {
          const rect = container.getBoundingClientRect();
          const clickX = rect.left + 30;
          const clickY = rect.top + rect.height / 2;

          return {
            success: true,
            found: true,
            selector,
            clickX,
            clickY,
            containerRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            iframeInfo
          };
        }
      }

      return { success: true, found: false, iframeInfo };
    },
    args: [],
  });

  const info = results[0]?.result as TurnstileInfo | undefined;
  if (!info) {
    return { error: 'Script execution failed' };
  }

  if (info.found && info.clickX !== undefined && info.clickY !== undefined) {
    try {
      const debuggee = { tabId };
      await chrome.debugger.attach(debuggee, '1.3');

      const clickX = info.clickX;
      const clickY = info.clickY;

      await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: clickX,
        y: clickY,
        button: 'left',
        clickCount: 1
      });

      await sleep(50);

      await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: clickX,
        y: clickY,
        button: 'left',
        clickCount: 1
      });

      await chrome.debugger.detach(debuggee);
      info.cdpClick = true;
    } catch (cdpError) {
      info.cdpError = cdpError instanceof Error ? cdpError.message : String(cdpError);
      await performFallbackClick(tabId, info.clickX, info.clickY);
    }
  }

  return info;
}

async function performFallbackClick(tabId: number, clickX: number, clickY: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (posX: number, posY: number) => {
      const targetEl = document.elementFromPoint(posX, posY);
      if (targetEl) {
        const eventInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: posX,
          clientY: posY,
          button: 0,
          buttons: 1,
        };
        targetEl.dispatchEvent(new MouseEvent('mousedown', eventInit));
        targetEl.dispatchEvent(new MouseEvent('mouseup', eventInit));
        targetEl.dispatchEvent(new MouseEvent('click', eventInit));
      }
    },
    args: [clickX, clickY],
  });
}

async function handleDebugPage(): Promise<ResponseMessage> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const iframes = Array.from(document.querySelectorAll('iframe')).map(frame => ({
        src: frame.src,
        id: frame.id,
        className: frame.className,
        width: frame.width,
        height: frame.height,
      }));

      const buttons = Array.from(document.querySelectorAll('button')).map(btn => ({
        text: btn.textContent.trim().substring(0, 50),
        type: btn.type,
        className: btn.className,
        disabled: btn.disabled,
      }));

      const cfElements = Array.from(document.querySelectorAll(
        '[class*="cloudflare"], [class*="turnstile"], [class*="challenge"], ' +
        '[id*="cloudflare"], [id*="turnstile"], [id*="challenge"]'
      )).map(div => ({
        tag: div.tagName,
        id: div.id,
        className: div.className,
      }));

      return { iframes, buttons, cfElements };
    },
    args: [],
  });
  const result = results[0]?.result as ResponseMessage | undefined;
  return result ?? { error: 'Script execution failed' };
}

async function handleWaitForSelector(selector: string, timeout: number): Promise<ResponseMessage> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (sel: string, timeoutMs: number) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const element = document.querySelector(sel);
        if (element) {
          return { success: true, found: true };
        }
        await new Promise((resolve) => { setTimeout(resolve, 100); });
      }
      return { success: true, found: false };
    },
    args: [selector, timeout],
  });
  const result = results[0]?.result as ResponseMessage | undefined;
  return result ?? { error: 'Script execution failed' };
}

async function handleGetContent(selector?: string): Promise<ResponseMessage> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel?: string) => {
      if (sel) {
        const element = document.querySelector(sel);
        return { success: true, content: element?.textContent ?? null };
      }
      return { success: true, content: document.body.innerText };
    },
    args: [selector],
  });
  const result = results[0]?.result as ResponseMessage | undefined;
  return result ?? { error: 'Script execution failed' };
}

// --- Main command dispatcher ---

async function handleCommand(message: CommandMessage): Promise<ResponseMessage> {
  const { type } = message;

  switch (type) {
    case 'navigate':
      if (!message.url) {
        return { error: 'Missing url parameter' };
      }
      return handleNavigate(message.url);

    case 'getUrl':
      return handleGetUrl();

    case 'executeScript':
      if (!message.code) {
        return { error: 'Missing code parameter' };
      }
      return handleExecuteScript(message.code);

    case 'fill':
      if (!message.selector || message.value === undefined) {
        return { error: 'Missing selector or value parameter' };
      }
      return handleFill(message.selector, message.value);

    case 'click':
      if (!message.selector) {
        return { error: 'Missing selector parameter' };
      }
      return handleClick(message.selector);

    case 'clickTurnstile':
      return handleClickTurnstile();

    case 'debugPage':
      return handleDebugPage();

    case 'waitForSelector':
      if (!message.selector) {
        return { error: 'Missing selector parameter' };
      }
      return handleWaitForSelector(message.selector, message.timeout ?? 10000);

    case 'getContent':
      return handleGetContent(message.selector);

    case 'ping':
      return { success: true, pong: true };

    default:
      return { error: `Unknown command: ${type}` };
  }
}

// Start connection when extension loads
connect();

// Also try to connect when service worker wakes up
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
