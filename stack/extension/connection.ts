import type { ControlAction } from "./control-action.js";
import { log } from "./logging.js";
import { handleCommand, isIncomingCommand } from "./messages/index.js";
import { isStepUpdateMessage, type StepUpdateMessage } from "./step-state.js";
import { getActiveTabId } from "./tabs.js";

const DEFAULT_WS_PORT = 8765;
const MAX_RECONNECT_DELAY_MS = 30000;
const BASE_RECONNECT_DELAY_MS = 1000;
const READY_TYPE = "ready";

let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
// Caches the latest step update so it survives content script re-injection on page navigation
let cachedStepUpdate: StepUpdateMessage | null = null;
let portPromise: Promise<number> | null = null;

async function fetchWsPort(): Promise<number> {
  try {
    const configUrl = chrome.runtime.getURL("ws-port");
    const response = await fetch(configUrl);
    const text = await response.text();
    const port = parseInt(text.trim(), 10);
    if (port > 0 && port < 65536) return port;
  } catch {
    // File absent in local dev — use default
  }
  return DEFAULT_WS_PORT;
}

function getWsPort(): Promise<number> {
  portPromise ??= fetchWsPort();
  return portPromise;
}

function getReconnectDelay(attempts: number): number {
  return Math.min(BASE_RECONNECT_DELAY_MS * 2 ** attempts, MAX_RECONNECT_DELAY_MS);
}

function scheduleReconnect(): void {
  if (reconnectTimeout) {
    return;
  }
  const delay = getReconnectDelay(reconnectAttempts);
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
  // Local ref for closures; ws may be reassigned on reconnect
  const currentSocket = new WebSocket(wsUrl);
  ws = currentSocket;

  currentSocket.onopen = () => {
    log("Connected to server");
    reconnectAttempts = 0;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    currentSocket.send(JSON.stringify({ type: READY_TYPE }));
  };

  currentSocket.onmessage = async (event: MessageEvent) => {
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

      if (!isIncomingCommand(parsed)) {
        throw new Error("Invalid command format");
      }
      messageId = parsed.id;
      log("Received command", { type: parsed.type });
      const result = await handleCommand(parsed);
      // Ensures the correlation id is always authoritative
      currentSocket.send(JSON.stringify({ ...result, id: messageId }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("Error handling message", { error: message });
      currentSocket.send(JSON.stringify({ id: messageId, type: "error", error: message }));
    }
  };

  currentSocket.onclose = () => {
    log("Disconnected from server");
    ws = null;
    scheduleReconnect();
  };

  currentSocket.onerror = (ev) => {
    const detail = ev instanceof ErrorEvent ? ev.message : "unknown";
    log("WebSocket error", { detail });
  };
}

async function forwardStepUpdateToContentScript(update: unknown): Promise<void> {
  try {
    const tabId = await getActiveTabId();
    await chrome.tabs.sendMessage(tabId, update);
  } catch {
    // Content script not injected yet or tab closed — ignore
  }
}

export function sendControlToServer(action: ControlAction): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "stepControl", action }));
  }
}

export function getCachedStepUpdate(): StepUpdateMessage | null {
  return cachedStepUpdate;
}
