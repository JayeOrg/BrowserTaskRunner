export interface StepState {
  current: number;
  total: number;
  name: string;
  state: "idle" | "running" | "paused" | "failed" | "done";
  error?: string;
}

export function isStepUpdateMessage(value: unknown): value is StepState & { type: "stepUpdate" } {
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
