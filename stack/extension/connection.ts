import { log } from "./logging.js";
import { handleCommand, isIncomingCommand } from "./messages/index.js";
import { isStepUpdateMessage } from "./step-state.js";
import { getLockedTabId } from "./tabs.js";

const DEFAULT_WS_PORT = 8765;
const MAX_RECONNECT_DELAY_MS = 30000;
const BASE_RECONNECT_DELAY_MS = 1000;

let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let cachedStepUpdate: unknown = null;
let portPromise: Promise<number> | null = null;

function getWsPort(): Promise<number> {
  if (!portPromise) {
    portPromise = (async () => {
      try {
        const configUrl = chrome.runtime.getURL("ws-port");
        const response = await fetch(configUrl);
        const text = await response.text();
        const port = parseInt(text.trim(), 10);
        if (Number.isFinite(port)) return port;
      } catch {
        // File absent in local dev — use default
      }
      return DEFAULT_WS_PORT;
    })();
  }
  return portPromise;
}

function getReconnectDelay(): number {
  const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
  return delay;
}

function scheduleReconnect(): void {
  if (reconnectTimeout) {
    return;
  }
  const delay = getReconnectDelay();
  reconnectAttempts++;
  log("Reconnecting", { delayMs: delay, attempt: reconnectAttempts });
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    void connect();
  }, delay);
}

export async function connect(): Promise<void> {
  const port = await getWsPort();
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const wsUrl = `ws://localhost:${String(port)}`;
  log("Connecting", { url: wsUrl });
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    log("Connected to server");
    reconnectAttempts = 0;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    ws?.send(JSON.stringify({ type: "ready" }));
  };

  ws.onmessage = async (event: MessageEvent) => {
    let messageId: number | undefined;
    try {
      if (typeof event.data !== "string") {
        throw new Error("Expected string message data");
      }
      const parsed: unknown = JSON.parse(event.data);

      if (isStepUpdateMessage(parsed)) {
        cachedStepUpdate = parsed;
        void forwardStepUpdateToContentScript(parsed);
        return;
      }

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "id" in parsed &&
        typeof parsed.id === "number"
      ) {
        messageId = parsed.id;
      }
      if (!isIncomingCommand(parsed)) {
        throw new Error("Invalid command format");
      }
      log("Received command", { type: parsed.type });
      const result = await handleCommand(parsed);
      ws?.send(JSON.stringify({ id: messageId, ...result }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("Error handling message", { error: message });
      ws?.send(JSON.stringify({ id: messageId, type: "error", error: message }));
    }
  };

  ws.onclose = () => {
    log("Disconnected from server");
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    log("WebSocket error");
  };
}

async function forwardStepUpdateToContentScript(update: unknown): Promise<void> {
  try {
    const tabId = getLockedTabId();
    if (tabId !== null) {
      await chrome.tabs.sendMessage(tabId, update);
      return;
    }
    // Tab not locked yet (step update arrived before first command) — fall back
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab && tab.id !== undefined) {
      await chrome.tabs.sendMessage(tab.id, update);
    }
  } catch {
    // Content script not injected yet or tab closed — ignore
  }
}

export function sendControlToServer(action: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "stepControl", action }));
  }
}

export function getCachedStepUpdate(): unknown {
  return cachedStepUpdate;
}
