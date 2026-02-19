import type { StepState } from "../step-state.js";

export const containerStyle = {
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
  pointerEvents: "none",
};

export const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "8px",
};

export const titleStyle = {
  fontWeight: "600",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  color: "#888",
};

export const badgeBaseStyle = {
  fontSize: "10px",
  fontWeight: "600",
  padding: "2px 6px",
  borderRadius: "4px",
  textTransform: "uppercase",
};

export const stepLabelStyle = {
  marginBottom: "8px",
  fontSize: "13px",
  fontWeight: "500",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const controlsContainerStyle = {
  display: "flex",
  gap: "6px",
};

export const BUTTON_BG = "rgba(255,255,255,0.1)";
export const BUTTON_HOVER_BG = "rgba(255,255,255,0.2)";

export const buttonStyle = {
  background: BUTTON_BG,
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#e0e0e0",
  borderRadius: "6px",
  padding: "4px 12px",
  cursor: "pointer",
  fontSize: "14px",
  lineHeight: "1",
  transition: "background 0.15s",
};

export const errorLabelStyle = {
  display: "none",
  fontSize: "11px",
  color: "#f87171",
  marginTop: "6px",
  wordBreak: "break-word",
  maxWidth: "100%",
};

export const hotkeyHintStyle = {
  fontSize: "10px",
  color: "#666",
  marginTop: "6px",
  textAlign: "center",
};

export const stateStyles: Record<StepState["state"], { bg: string; color: string; text: string }> =
  {
    idle: { bg: "rgba(128,128,128,0.3)", color: "#aaa", text: "IDLE" },
    running: { bg: "rgba(34,197,94,0.2)", color: "#4ade80", text: "RUNNING" },
    paused: { bg: "rgba(250,204,21,0.2)", color: "#facc15", text: "PAUSED" },
    failed: { bg: "rgba(239,68,68,0.2)", color: "#f87171", text: "FAILED" },
    done: { bg: "rgba(59,130,246,0.2)", color: "#60a5fa", text: "DONE" },
  };
