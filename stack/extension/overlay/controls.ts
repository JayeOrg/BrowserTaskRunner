import { stateStyles } from "./styles.js";
import { createOverlay, type OverlayElements } from "./dom.js";
import type { StepState } from "../step-state.js";

let elements: OverlayElements | null = null;
let visible = false;
let currentState: StepState["state"] = "idle";

function sendControl(action: string): void {
  void chrome.runtime.sendMessage({ type: "stepControl", action });
}

function ensureOverlay(): void {
  if (!elements) {
    elements = createOverlay(sendControl);
    if (elements) {
      updateStateBadge("idle");
    }
  }
}

function updateStateBadge(state: StepState["state"]): void {
  if (!elements) return;
  currentState = state;
  const entry = stateStyles[state];
  elements.stateBadge.textContent = entry.text;
  elements.stateBadge.style.background = entry.bg;
  elements.stateBadge.style.color = entry.color;
}

function updateControlButtons(): void {
  if (!elements) return;
  const stopped = currentState === "paused" || currentState === "failed";
  // When paused/failed: show step back, play, step forward. Hide pause.
  // When running: show pause only.
  elements.rewindBtn.style.display = stopped ? "" : "none";
  elements.pauseBtn.style.display = stopped ? "none" : "";
  elements.playBtn.style.display = stopped ? "" : "none";
  elements.stepBtn.style.display = stopped ? "" : "none";
}

export function updateOverlay(update: StepState): void {
  ensureOverlay();
  if (elements) {
    elements.stepLabel.textContent = `Step ${String(update.current)}/${String(update.total)}: ${update.name}`;
  }
  updateStateBadge(update.state);
  updateControlButtons();

  if (elements) {
    if (update.state === "failed" && update.error) {
      elements.errorLabel.textContent = update.error;
      elements.errorLabel.style.display = "block";
    } else {
      elements.errorLabel.style.display = "none";
    }
  }

  // Auto-show on first update
  if (!visible && elements) {
    visible = true;
    elements.container.style.display = "block";
  }
}

export function toggleVisibility(): void {
  ensureOverlay();
  visible = !visible;
  if (elements) {
    elements.container.style.display = visible ? "block" : "none";
  }
}
