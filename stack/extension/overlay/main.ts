import { isStepUpdateMessage } from "../step-state.js";
import { updateOverlay, toggleVisibility } from "./controls.js";

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isStepUpdateMessage(message)) {
    updateOverlay(message);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key === ".") {
    event.preventDefault();
    toggleVisibility();
  }
});

// Request cached state on load — survives page navigations
void chrome.runtime.sendMessage({ type: "getStepState" }).then((response: unknown) => {
  if (isStepUpdateMessage(response)) {
    updateOverlay(response);
  }
});
