// SiteCheck debug overlay — content script injected into web pages.
// Self-contained: inline styles, no external dependencies.

interface StepState {
  current: number;
  total: number;
  name: string;
  state: "idle" | "running" | "paused" | "failed" | "done";
  error?: string;
}

const OVERLAY_ID = "sitecheck-overlay";

let container: HTMLDivElement | null = null;
let stepLabel: HTMLSpanElement | null = null;
let errorLabel: HTMLDivElement | null = null;
let stateBadge: HTMLSpanElement | null = null;
let rewindBtn: HTMLButtonElement | null = null;
let pauseBtn: HTMLButtonElement | null = null;
let playBtn: HTMLButtonElement | null = null;
let stepBtn: HTMLButtonElement | null = null;
let visible = false;
let currentState: StepState["state"] = "idle";

function sendControl(action: string): void {
  void chrome.runtime.sendMessage({ type: "stepControl", action });
}

function createOverlay(): void {
  if (document.getElementById(OVERLAY_ID)) return;

  container = document.createElement("div");
  container.id = OVERLAY_ID;
  Object.assign(container.style, {
    position: "fixed",
    bottom: "16px",
    right: "16px",
    zIndex: "2147483647",
    background: "rgba(17, 17, 17, 0.92)",
    color: "#e0e0e0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "13px",
    borderRadius: "10px",
    padding: "10px 14px",
    width: "240px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.1)",
    display: "none",
    userSelect: "none",
    lineHeight: "1.4",
  });

  // Header
  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  });

  const title = document.createElement("span");
  title.textContent = "SiteCheck";
  Object.assign(title.style, {
    fontWeight: "600",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "#888",
  });

  stateBadge = document.createElement("span");
  Object.assign(stateBadge.style, {
    fontSize: "10px",
    fontWeight: "600",
    padding: "2px 6px",
    borderRadius: "4px",
    textTransform: "uppercase",
  });
  updateStateBadge("idle");

  header.appendChild(title);
  header.appendChild(stateBadge);

  // Step info
  stepLabel = document.createElement("div");
  stepLabel.textContent = "Waiting...";
  Object.assign(stepLabel.style, {
    marginBottom: "8px",
    fontSize: "13px",
    fontWeight: "500",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });

  // Controls
  const controls = document.createElement("div");
  Object.assign(controls.style, {
    display: "flex",
    gap: "6px",
  });

  rewindBtn = createButton("\u23EE", "skipBack", "Skip back");
  pauseBtn = createButton("\u23F8", "pause", "Pause");
  playBtn = createButton("\u25B6", "play", "Play");
  stepBtn = createButton("\u23ED", "skipForward", "Skip forward");

  controls.appendChild(rewindBtn);
  controls.appendChild(pauseBtn);
  controls.appendChild(playBtn);
  controls.appendChild(stepBtn);

  // Error message (hidden by default)
  errorLabel = document.createElement("div");
  Object.assign(errorLabel.style, {
    display: "none",
    fontSize: "11px",
    color: "#f87171",
    marginTop: "6px",
    wordBreak: "break-word",
    maxWidth: "250px",
  });

  container.appendChild(header);
  container.appendChild(stepLabel);
  container.appendChild(controls);
  container.appendChild(errorLabel);
  document.body.appendChild(container);
}

function createButton(label: string, action: string, titleText: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.title = titleText;
  Object.assign(btn.style, {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "#e0e0e0",
    borderRadius: "6px",
    padding: "4px 12px",
    cursor: "pointer",
    fontSize: "14px",
    lineHeight: "1",
    transition: "background 0.15s",
  });
  btn.addEventListener("mouseenter", () => {
    btn.style.background = "rgba(255,255,255,0.2)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "rgba(255,255,255,0.1)";
  });
  btn.addEventListener("click", () => {
    sendControl(action);
  });
  return btn;
}

function updateStateBadge(state: StepState["state"]): void {
  if (!stateBadge) return;
  currentState = state;

  const styles: Record<StepState["state"], { bg: string; color: string; text: string }> = {
    idle: { bg: "rgba(128,128,128,0.3)", color: "#aaa", text: "IDLE" },
    running: { bg: "rgba(34,197,94,0.2)", color: "#4ade80", text: "RUNNING" },
    paused: { bg: "rgba(250,204,21,0.2)", color: "#facc15", text: "PAUSED" },
    failed: { bg: "rgba(239,68,68,0.2)", color: "#f87171", text: "FAILED" },
    done: { bg: "rgba(59,130,246,0.2)", color: "#60a5fa", text: "DONE" },
  };

  const entry = styles[state];
  stateBadge.textContent = entry.text;
  stateBadge.style.background = entry.bg;
  stateBadge.style.color = entry.color;
}

function updateControlButtons(): void {
  if (!rewindBtn || !pauseBtn || !playBtn || !stepBtn) return;
  const stopped = currentState === "paused" || currentState === "failed";
  // When paused/failed: show step back, play, step forward. Hide pause.
  // When running: show pause only.
  rewindBtn.style.display = stopped ? "" : "none";
  pauseBtn.style.display = stopped ? "none" : "";
  playBtn.style.display = stopped ? "" : "none";
  stepBtn.style.display = stopped ? "" : "none";
}

function updateOverlay(update: StepState): void {
  if (!container) {
    createOverlay();
  }
  if (stepLabel) {
    stepLabel.textContent = `Step ${String(update.current)}/${String(update.total)}: ${update.name}`;
  }
  updateStateBadge(update.state);
  updateControlButtons();

  // Show/hide error message
  if (errorLabel) {
    if (update.state === "failed" && update.error) {
      errorLabel.textContent = update.error;
      errorLabel.style.display = "block";
    } else {
      errorLabel.style.display = "none";
    }
  }

  // Auto-show on first update
  if (!visible && container) {
    visible = true;
    container.style.display = "block";
  }
}

function toggleVisibility(): void {
  if (!container) {
    createOverlay();
  }
  visible = !visible;
  if (container) {
    container.style.display = visible ? "block" : "none";
  }
}

function isStepUpdateMessage(value: unknown): value is StepState & { type: "stepUpdate" } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "stepUpdate" &&
    "current" in value &&
    "total" in value &&
    "name" in value &&
    "state" in value
  );
}

// Listen for step updates from the service worker
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isStepUpdateMessage(message)) {
    updateOverlay(message);
  }
});

// Hotkey: Ctrl+Shift+. to toggle overlay
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key === ".") {
    event.preventDefault();
    toggleVisibility();
  }
});

// On load, request cached state from service worker (survives page navigations)
void chrome.runtime.sendMessage({ type: "getStepState" }).then((response: unknown) => {
  if (isStepUpdateMessage(response)) {
    createOverlay();
    updateOverlay(response);
  }
});
