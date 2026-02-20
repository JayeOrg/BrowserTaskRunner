export interface StepState {
  current: number;
  total: number;
  name: string;
  state: "idle" | "running" | "paused" | "failed" | "done";
  error?: string;
}

export type StepUpdateMessage = StepState & { type: "stepUpdate" };

export function isStepUpdateMessage(value: unknown): value is StepUpdateMessage {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    value.type !== "stepUpdate"
  ) {
    return false;
  }
  return (
    "current" in value &&
    typeof value.current === "number" &&
    "total" in value &&
    typeof value.total === "number" &&
    "name" in value &&
    typeof value.name === "string" &&
    "state" in value &&
    typeof value.state === "string"
  );
}
