// WebSocket connection to Node.js server
let ws = null;
let reconnectInterval = null;
const WS_URL = 'ws://localhost:8765';

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  console.log('[SiteCheck] Connecting to', WS_URL);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[SiteCheck] Connected to server');
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
    // Notify server we're ready
    ws.send(JSON.stringify({ type: 'ready' }));
  };

  ws.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('[SiteCheck] Received command:', message.type);
      const result = await handleCommand(message);
      ws.send(JSON.stringify({ id: message.id, ...result }));
    } catch (error) {
      console.error('[SiteCheck] Error handling message:', error);
      ws.send(JSON.stringify({ id: message?.id, error: error.message }));
    }
  };

  ws.onclose = () => {
    console.log('[SiteCheck] Disconnected from server');
    ws = null;
    // Reconnect after delay
    if (!reconnectInterval) {
      reconnectInterval = setInterval(connect, 3000);
    }
  };

  ws.onerror = (error) => {
    console.error('[SiteCheck] WebSocket error:', error);
  };
}

async function handleCommand(message) {
  const { type, ...params } = message;

  switch (type) {
    case 'navigate': {
      const tab = await getActiveTab();
      await chrome.tabs.update(tab.id, { url: params.url });
      // Wait for page to load
      await waitForTabLoad(tab.id);
      return { success: true, url: params.url };
    }

    case 'getUrl': {
      const tab = await getActiveTab();
      return { success: true, url: tab.url, title: tab.title };
    }

    case 'executeScript': {
      const tab = await getActiveTab();
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: new Function(params.code),
      });
      return { success: true, result: results[0]?.result };
    }

    case 'fill': {
      const tab = await getActiveTab();
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selector, value) => {
          const el = document.querySelector(selector);
          if (!el) return { error: 'Element not found: ' + selector };
          el.focus();
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true };
        },
        args: [params.selector, params.value],
      });
      return results[0]?.result || { error: 'Script failed' };
    }

    case 'click': {
      const tab = await getActiveTab();
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selector) => {
          const el = document.querySelector(selector);
          if (!el) return { error: 'Element not found: ' + selector };

          // Get element position for realistic coordinates
          const rect = el.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;

          // Create realistic mouse event sequence
          const eventOptions = {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            screenX: x + window.screenX,
            screenY: y + window.screenY,
            button: 0,
            buttons: 1,
          };

          el.dispatchEvent(new MouseEvent('mousedown', eventOptions));
          el.dispatchEvent(new MouseEvent('mouseup', eventOptions));
          el.dispatchEvent(new MouseEvent('click', eventOptions));

          return { success: true };
        },
        args: [params.selector],
      });
      return results[0]?.result || { error: 'Script failed' };
    }

    case 'clickTurnstile': {
      const tab = await getActiveTab();

      // First, find the Turnstile widget coordinates
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const allIframes = Array.from(document.querySelectorAll('iframe'));
          const iframeInfo = allIframes.map(f => ({
            src: f.src,
            id: f.id,
            className: f.className,
            rect: f.getBoundingClientRect()
          }));

          // Find the Turnstile container
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
              // The checkbox is typically at ~30px from left, centered vertically
              const x = rect.left + 30;
              const y = rect.top + rect.height / 2;

              return {
                success: true,
                found: true,
                selector,
                clickX: x,
                clickY: y,
                containerRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                iframeInfo
              };
            }
          }

          return { success: true, found: false, iframeInfo };
        },
        args: [],
      });

      const info = results[0]?.result;
      if (info?.found && info?.clickX !== undefined) {
        // Use Chrome Debugger API to perform a real click
        try {
          const debuggee = { tabId: tab.id };

          // Attach debugger
          await chrome.debugger.attach(debuggee, '1.3');

          // Perform mouse click using CDP Input.dispatchMouseEvent
          const x = info.clickX;
          const y = info.clickY;

          // Mouse pressed
          await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: x,
            y: y,
            button: 'left',
            clickCount: 1
          });

          // Small delay
          await new Promise(r => setTimeout(r, 50));

          // Mouse released
          await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: x,
            y: y,
            button: 'left',
            clickCount: 1
          });

          // Detach debugger
          await chrome.debugger.detach(debuggee);

          info.cdpClick = true;
        } catch (cdpError) {
          info.cdpError = cdpError.message;
          // Fallback to regular click
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (x, y) => {
              const targetEl = document.elementFromPoint(x, y);
              if (targetEl) {
                const eventInit = {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: x,
                  clientY: y,
                  button: 0,
                  buttons: 1,
                };
                targetEl.dispatchEvent(new MouseEvent('mousedown', eventInit));
                targetEl.dispatchEvent(new MouseEvent('mouseup', eventInit));
                targetEl.dispatchEvent(new MouseEvent('click', eventInit));
              }
            },
            args: [info.clickX, info.clickY],
          });
        }
      }

      return info || { error: 'Script failed' };
    }

    case 'debugPage': {
      const tab = await getActiveTab();
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
            src: f.src,
            id: f.id,
            className: f.className,
            width: f.width,
            height: f.height,
          }));

          const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
            text: b.textContent?.trim().substring(0, 50),
            type: b.type,
            className: b.className,
            disabled: b.disabled,
          }));

          const divs = Array.from(document.querySelectorAll('[class*="cloudflare"], [class*="turnstile"], [class*="challenge"], [id*="cloudflare"], [id*="turnstile"], [id*="challenge"]')).map(d => ({
            tag: d.tagName,
            id: d.id,
            className: d.className,
          }));

          return { iframes, buttons, cfElements: divs };
        },
        args: [],
      });
      return results[0]?.result || { error: 'Script failed' };
    }

    case 'waitForSelector': {
      const tab = await getActiveTab();
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (selector, timeout) => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return { success: true, found: true };
            await new Promise(r => setTimeout(r, 100));
          }
          return { success: true, found: false };
        },
        args: [params.selector, params.timeout || 10000],
      });
      return results[0]?.result || { error: 'Script failed' };
    }

    case 'getContent': {
      const tab = await getActiveTab();
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selector) => {
          if (selector) {
            const el = document.querySelector(selector);
            return { success: true, content: el?.textContent || null };
          }
          return { success: true, content: document.body.innerText };
        },
        args: [params.selector],
      });
      return results[0]?.result || { error: 'Script failed' };
    }

    case 'ping': {
      return { success: true, pong: true };
    }

    default:
      return { error: 'Unknown command: ' + type };
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab');
  return tab;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        // Small delay for page scripts to initialize
        setTimeout(resolve, 500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Timeout after 30 seconds
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

// Start connection when extension loads
connect();

// Also try to connect when service worker wakes up
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
