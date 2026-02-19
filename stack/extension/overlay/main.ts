import { isStepUpdateMessage } from "../step-state.js";
import { updateOverlay, toggleInteractive, showNotConnected } from "./controls.js";

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isStepUpdateMessage(message)) {
    updateOverlay(message);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key === ".") {
    event.preventDefault();
    toggleInteractive();
  }
});

// Request cached state on load — survives page navigations
void chrome.runtime.sendMessage({ type: "getStepState" }).then((response: unknown) => {
  if (isStepUpdateMessage(response)) {
    updateOverlay(response);
  } else {
    showNotConnected();
  }
});
