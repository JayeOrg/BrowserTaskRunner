import { isStepUpdateMessage } from "../step-state.js";
import { updateOverlay, toggleInteractive, showNotConnected } from "./controls.js";

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isStepUpdateMessage(message)) {
    updateOverlay(message);
  }
});

document.addEventListener(
  "keydown",
  (event) => {
    if (event.ctrlKey && event.shiftKey && event.key === ".") {
      event.preventDefault();
      toggleInteractive();
    }
  },
  { capture: true },
);

// Request cached state on load — survives page navigations
chrome.runtime
  .sendMessage({ type: "getStepState" })
  .then((response: unknown) => {
    if (isStepUpdateMessage(response)) {
      updateOverlay(response);
    } else {
      showNotConnected();
    }
  })
  .catch(() => {
    showNotConnected();
  });
