import type { ResponseMessage } from '../types.js';

// Simple prefix logger for extension context
function formatTime(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
}

function log(msg: string, data?: Record<string, unknown>): void {
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${formatTime()} SiteCheck] ${msg}${dataStr}`);
}

// WebSocket connection to Node.js server
let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const WS_URL = 'ws://localhost:8765';
const MAX_RECONNECT_DELAY_MS = 30000;
const BASE_RECONNECT_DELAY_MS = 1000;

// Incoming WebSocket message - intentionally loose since we receive JSON and validate per-command
interface IncomingCommand {
  id?: number;
  type: string;
  url?: string;
  selector?: string;
  selectors?: string[];
  value?: string;
  timeout?: number;
  x?: number;
  y?: number;
}

function isIncomingCommand(value: unknown): value is IncomingCommand {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('type' in value)) {
    return false;
  }
  // After 'type' in value check, TypeScript narrows to { type: unknown }
  return typeof value.type === 'string';
}

function isResponseMessage(value: unknown): value is ResponseMessage {
  return typeof value === 'object' && value !== null;
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
  log('Reconnecting', { delayMs: delay, attempt: reconnectAttempts });
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connect();
  }, delay);
}

function connect(): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return;
  }

  log('Connecting', { url: WS_URL });
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    log('Connected to server');
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
      const parsed: unknown = JSON.parse(event.data);
      if (!isIncomingCommand(parsed)) {
        throw new Error('Invalid command format');
      }
      const incoming = parsed;
      messageId = incoming.id;
      log('Received command', { type: incoming.type });
      const result = await handleCommand(incoming);
      ws?.send(JSON.stringify({ id: messageId, ...result }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('Error handling message', { error: message });
      ws?.send(JSON.stringify({ id: messageId, error: message }));
    }
  };

  ws.onclose = () => {
    log('Disconnected from server');
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    log('WebSocket error');
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
        log('Tab load timed out', { timeoutMs });
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
  const result = isResponseMessage(results[0]?.result) ? results[0].result : undefined;
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
  const result = isResponseMessage(results[0]?.result) ? results[0].result : undefined;
  return result ?? { error: 'Script execution failed' };
}

async function handleCdpClick(x: number, y: number): Promise<ResponseMessage> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);

  try {
    const debuggee = { tabId };
    await chrome.debugger.attach(debuggee, '1.3');

    await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1
    });

    await sleep(50);

    await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1
    });

    await chrome.debugger.detach(debuggee);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Fall back to JS click at coordinates
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
      args: [x, y],
    });
    return { success: true, error: `CDP failed, used fallback: ${message}` };
  }
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
  const result = isResponseMessage(results[0]?.result) ? results[0].result : undefined;
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
  const result = isResponseMessage(results[0]?.result) ? results[0].result : undefined;
  return result ?? { error: 'Script execution failed' };
}

async function handleQuerySelectorRect(selectors: string[]): Promise<ResponseMessage> {
  const tab = await getActiveTab();
  const tabId = getTabId(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sels: string[]) => {
      for (const sel of sels) {
        const element = document.querySelector(sel);
        if (element) {
          const domRect = element.getBoundingClientRect();
          return {
            success: true,
            found: true,
            selector: sel,
            rect: {
              left: domRect.left,
              top: domRect.top,
              width: domRect.width,
              height: domRect.height,
            },
          };
        }
      }
      return { success: true, found: false };
    },
    args: [selectors],
  });
  const result = isResponseMessage(results[0]?.result) ? results[0].result : undefined;
  return result ?? { error: 'Script execution failed' };
}

// --- Command dispatcher using lookup table ---

type CommandHandler = (message: IncomingCommand) => Promise<ResponseMessage>;

const commandHandlers: Record<string, CommandHandler> = {
  navigate: async (msg) => {
    if (!msg.url) {
      return { error: 'Missing url parameter' };
    }
    return handleNavigate(msg.url);
  },

  getUrl: async () => handleGetUrl(),

  fill: async (msg) => {
    if (!msg.selector || msg.value === undefined) {
      return { error: 'Missing selector or value parameter' };
    }
    return handleFill(msg.selector, msg.value);
  },

  click: async (msg) => {
    if (!msg.selector) {
      return { error: 'Missing selector parameter' };
    }
    return handleClick(msg.selector);
  },

  cdpClick: async (msg) => {
    if (msg.x === undefined || msg.y === undefined) {
      return { error: 'Missing x or y parameter' };
    }
    return handleCdpClick(msg.x, msg.y);
  },

  waitForSelector: async (msg) => {
    if (!msg.selector) {
      return { error: 'Missing selector parameter' };
    }
    return handleWaitForSelector(msg.selector, msg.timeout ?? 10000);
  },

  getContent: async (msg) => handleGetContent(msg.selector),

  querySelectorRect: async (msg) => {
    if (!msg.selectors || msg.selectors.length === 0) {
      return { error: 'Missing selectors parameter' };
    }
    return handleQuerySelectorRect(msg.selectors);
  },

  ping: async () => ({ success: true, pong: true }),
};

async function handleCommand(message: IncomingCommand): Promise<ResponseMessage> {
  const handler = commandHandlers[message.type];
  if (!handler) {
    return { error: `Unknown command: ${message.type}` };
  }
  return handler(message);
}

// Start connection when extension loads
connect();

// Also try to connect when service worker wakes up
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
