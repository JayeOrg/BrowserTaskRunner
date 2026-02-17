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

const OVERLAY_ID = "sitecheck-overlay";

export interface OverlayElements {
  container: HTMLDivElement;
  stepLabel: HTMLDivElement;
  errorLabel: HTMLDivElement;
  hotkeyHint: HTMLDivElement;
  stateBadge: HTMLSpanElement;
  rewindBtn: HTMLButtonElement;
  pauseBtn: HTMLButtonElement;
  playBtn: HTMLButtonElement;
  stepBtn: HTMLButtonElement;
}

function createButton(
  label: string,
  action: string,
  titleText: string,
  onControl: (action: string) => void,
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

export function createOverlay(onControl: (action: string) => void): OverlayElements {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    existing.remove();
  }

  const container = document.createElement("div");
  container.id = OVERLAY_ID;
  Object.assign(container.style, containerStyle);

  // Header
  const header = document.createElement("div");
  Object.assign(header.style, headerStyle);

  const title = document.createElement("span");
  title.textContent = "SiteCheck";
  Object.assign(title.style, titleStyle);

  const stateBadge = document.createElement("span");
  Object.assign(stateBadge.style, badgeBaseStyle);

  header.appendChild(title);
  header.appendChild(stateBadge);

  // Step info
  const stepLabel = document.createElement("div");
  stepLabel.textContent = "Waiting...";
  Object.assign(stepLabel.style, stepLabelStyle);

  // Controls
  const controls = document.createElement("div");
  Object.assign(controls.style, controlsContainerStyle);

  const rewindBtn = createButton("⏮", "skipBack", "Skip back", onControl);
  const pauseBtn = createButton("⏸", "pause", "Pause", onControl);
  const playBtn = createButton("▶", "play", "Play", onControl);
  const stepBtn = createButton("⏭", "skipForward", "Skip forward", onControl);

  controls.appendChild(rewindBtn);
  controls.appendChild(pauseBtn);
  controls.appendChild(playBtn);
  controls.appendChild(stepBtn);

  // Error message (hidden by default)
  const errorLabel = document.createElement("div");
  Object.assign(errorLabel.style, errorLabelStyle);

  // Hotkey hint
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
    rewindBtn,
    pauseBtn,
    playBtn,
    stepBtn,
  };
}
