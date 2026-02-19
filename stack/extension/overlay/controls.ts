import { stateStyles } from "./styles.js";
import { createOverlay, type OverlayElements } from "./dom.js";
import type { StepState } from "../step-state.js";
import type { ControlAction } from "../control-action.js";

let elements: OverlayElements | null = null;
let interactive = false;
let currentState: StepState["state"] = "idle";

function sendControl(action: ControlAction): void {
  void chrome.runtime.sendMessage({ type: "stepControl", action });
}

function ensureOverlay(): void {
  if (!elements) {
    elements = createOverlay(sendControl);
    updateStateBadge("idle");
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

function buttonVisibility(state: StepState["state"]): {
  rewind: string;
  pause: string;
  play: string;
  step: string;
} {
  if (state === "done") return { rewind: "none", pause: "none", play: "none", step: "none" };
  const stopped = state === "paused" || state === "failed";
  return {
    rewind: stopped ? "inline-block" : "none",
    pause: stopped ? "none" : "inline-block",
    play: stopped ? "inline-block" : "none",
    step: stopped ? "inline-block" : "none",
  };
}

function updateControlButtons(): void {
  if (!elements) return;
  const vis = buttonVisibility(currentState);
  elements.skipBackBtn.style.display = vis.rewind;
  elements.pauseBtn.style.display = vis.pause;
  elements.playBtn.style.display = vis.play;
  elements.skipForwardBtn.style.display = vis.step;
}

function applyInteractive(): void {
  if (!elements) return;
  elements.container.style.pointerEvents = interactive ? "auto" : "none";
  elements.hotkeyHint.textContent = interactive
    ? "Ctrl+Shift+. to lock controls"
    : "Ctrl+Shift+. to unlock controls";
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

  showOnFirstStateArrival();
}

function showOnFirstStateArrival(): void {
  if (elements && elements.container.style.display === "none") {
    elements.container.style.display = "block";
  }
}

export function showNotConnected(): void {
  ensureOverlay();
  if (elements) {
    elements.stepLabel.textContent = "Waiting for connection...";
  }
  updateStateBadge("idle");
  updateControlButtons();
  showOnFirstStateArrival();
}

export function toggleInteractive(): void {
  ensureOverlay();
  interactive = !interactive;
  applyInteractive();
}
