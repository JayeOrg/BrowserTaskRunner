import { connect, sendControlToServer, getCachedStepUpdate } from "./connection.js";

chrome.runtime.onStartup.addListener(() => void connect());
chrome.runtime.onInstalled.addListener(() => void connect());

function isControlMessage(value: unknown): value is { type: "stepControl"; action: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "stepControl" &&
    "action" in value &&
    typeof value.action === "string"
  );
}

function isGetStepState(value: unknown): value is { type: "getStepState" } {
  return (
    typeof value === "object" && value !== null && "type" in value && value.type === "getStepState"
  );
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (isControlMessage(message)) {
    sendControlToServer(message.action);
  }

  if (isGetStepState(message)) {
    const cached = getCachedStepUpdate();
    sendResponse(cached);
    return;
  }

  sendResponse();
});
