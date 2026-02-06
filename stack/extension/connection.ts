import { log } from "./logging.js";
import { handleCommand, isIncomingCommand } from "./messages/index.js";

const WS_URL = "ws://localhost:8765";
const MAX_RECONNECT_DELAY_MS = 30000;
const BASE_RECONNECT_DELAY_MS = 1000;

let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

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
    connect();
  }, delay);
}

export function connect(): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return;
  }

  log("Connecting", { url: WS_URL });
  ws = new WebSocket(WS_URL);

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
      if (!isIncomingCommand(parsed)) {
        throw new Error("Invalid command format");
      }
      messageId = parsed.id;
      log("Received command", { type: parsed.type });
      const result = await handleCommand(parsed);
      ws?.send(JSON.stringify({ id: messageId, ...result }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("Error handling message", { error: message });
      ws?.send(JSON.stringify({ id: messageId, error: message }));
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
