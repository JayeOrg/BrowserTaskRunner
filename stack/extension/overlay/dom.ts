import {
  containerStyle,
  headerStyle,
  titleStyle,
  badgeBaseStyle,
  stepLabelStyle,
  controlsContainerStyle,
  buttonStyle,
  BUTTON_BG,
  BUTTON_HOVER_BG,
  errorLabelStyle,
  hotkeyHintStyle,
} from "./styles.js";
import type { ControlAction } from "../control-action.js";

const OVERLAY_ID = "sitecheck-overlay";

export interface OverlayElements {
  container: HTMLDivElement;
  stepLabel: HTMLDivElement;
  errorLabel: HTMLDivElement;
  hotkeyHint: HTMLDivElement;
  stateBadge: HTMLSpanElement;
  skipBackBtn: HTMLButtonElement;
  pauseBtn: HTMLButtonElement;
  playBtn: HTMLButtonElement;
  skipForwardBtn: HTMLButtonElement;
}

function createButton(
  label: string,
  action: ControlAction,
  titleText: string,
  onControl: (action: ControlAction) => void,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.title = titleText;
  Object.assign(btn.style, buttonStyle);
  btn.addEventListener("mouseenter", () => {
    btn.style.background = BUTTON_HOVER_BG;
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = BUTTON_BG;
  });
  btn.addEventListener("click", () => {
    onControl(action);
  });
  return btn;
}

export function createOverlay(onControl: (action: ControlAction) => void): OverlayElements {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    console.warn("[SiteCheck]", "Removing existing overlay");
    existing.remove();
  }

  const container = document.createElement("div");
  container.id = OVERLAY_ID;
  Object.assign(container.style, containerStyle);

  const header = document.createElement("div");
  Object.assign(header.style, headerStyle);

  const title = document.createElement("span");
  title.textContent = "SiteCheck";
  Object.assign(title.style, titleStyle);

  const stateBadge = document.createElement("span");
  Object.assign(stateBadge.style, badgeBaseStyle);

  header.appendChild(title);
  header.appendChild(stateBadge);

  const stepLabel = document.createElement("div");
  stepLabel.textContent = "Waiting...";
  Object.assign(stepLabel.style, stepLabelStyle);

  const controls = document.createElement("div");
  Object.assign(controls.style, controlsContainerStyle);

  const skipBackBtn = createButton("⏮", "skipBack", "Skip back", onControl);
  const pauseBtn = createButton("⏸", "pause", "Pause", onControl);
  const playBtn = createButton("▶", "play", "Play", onControl);
  const skipForwardBtn = createButton("⏭", "skipForward", "Skip forward", onControl);

  controls.appendChild(skipBackBtn);
  controls.appendChild(pauseBtn);
  controls.appendChild(playBtn);
  controls.appendChild(skipForwardBtn);

  const errorLabel = document.createElement("div");
  Object.assign(errorLabel.style, errorLabelStyle);

  const hotkeyHint = document.createElement("div");
  hotkeyHint.textContent = "Ctrl+Shift+. to unlock controls";
  Object.assign(hotkeyHint.style, hotkeyHintStyle);

  container.appendChild(header);
  container.appendChild(stepLabel);
  container.appendChild(controls);
  container.appendChild(errorLabel);
  container.appendChild(hotkeyHint);
  document.body.appendChild(container);

  return {
    container,
    stepLabel,
    errorLabel,
    hotkeyHint,
    stateBadge,
    skipBackBtn,
    pauseBtn,
    playBtn,
    skipForwardBtn,
  };
}
