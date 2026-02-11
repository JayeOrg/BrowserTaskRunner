import type { PrefixLogger } from "./logging.js";

export interface StepUpdate {
  current: number;
  total: number;
  name: string;
  state: "idle" | "running" | "paused" | "failed" | "done";
  error?: string;
}

type ControlAction = "pause" | "play" | "skipBack" | "skipForward";

interface StepDefinition {
  name: string;
  fn: () => Promise<void>;
}

interface Gate {
  promise: Promise<void>;
  open: () => void;
}

function createGate(): Gate {
  // eslint-disable-next-line no-empty-function
  let resolver = (): void => {};
  const promise = new Promise<void>((resolve) => {
    resolver = resolve;
  });
  return { promise, open: resolver };
}

function isControlAction(value: string): value is ControlAction {
  return value === "pause" || value === "play" || value === "skipBack" || value === "skipForward";
}

export interface StepRunnerDeps {
  sendStepUpdate: (update: StepUpdate) => void;
  onControl: (handler: (action: string) => void) => void;
  logger?: PrefixLogger;
  pauseOnError?: boolean;
}

export class StepRunner {
  private steps: StepDefinition[] = [];
  private pointer = 0;
  private paused = false;
  private gate: Gate = createGate();
  private readonly sendUpdate: (update: StepUpdate) => void;
  private readonly log: PrefixLogger | undefined;
  private readonly pauseOnError: boolean;

  constructor(deps: StepRunnerDeps) {
    this.sendUpdate = deps.sendStepUpdate;
    this.log = deps.logger;
    this.pauseOnError = (deps.pauseOnError ?? false) && process.env.STEP_DEBUG === "1";
    deps.onControl((raw) => {
      if (isControlAction(raw)) {
        this.handleControl(raw);
      }
    });
  }

  step(name: string, fn: () => Promise<void>): this {
    this.steps.push({ name, fn });
    return this;
  }

  async execute(): Promise<void> {
    if (this.steps.length === 0) return;

    this.pointer = 0;

    while (this.pointer < this.steps.length) {
      if (this.paused) {
        this.emitUpdate("paused");
        this.log?.log("Paused", { step: this.currentStepName() });
        await this.gate.promise;
      }

      const idx = this.pointer;
      const step = this.steps[idx];
      if (!step) break;
      this.emitUpdate("running");
      this.log?.log("Running step", {
        step: step.name,
        progress: `${String(idx + 1)}/${String(this.steps.length)}`,
      });

      let stepFailed = false;
      try {
        await step.fn();
      } catch (error) {
        if (!this.pauseOnError) throw error;

        const msg = error instanceof Error ? error.message : String(error);
        this.log?.error("Step failed", { step: step.name, error: msg });
        this.emitErrorUpdate(msg);

        // Pause and wait — user can rewind/play via overlay after inspecting via VNC
        this.paused = true;
        await this.gate.promise;
        stepFailed = true;
      }

      // Only advance if step succeeded and we haven't been rewound
      if (!stepFailed && this.pointer === idx) {
        this.pointer++;
      }
    }

    this.emitUpdate("done");
  }

  private handleControl(action: ControlAction): void {
    switch (action) {
      case "pause":
        this.paused = true;
        this.emitUpdate("paused");
        this.log?.log("Pause requested");
        break;
      case "play":
        this.paused = false;
        this.gate.open();
        this.gate = createGate();
        this.log?.log("Play requested");
        break;
      case "skipBack":
        if (this.pointer > 0) {
          this.pointer--;
        }
        this.emitUpdate("paused");
        this.log?.log("Skip back", { step: this.currentStepName() });
        break;
      case "skipForward":
        if (this.pointer < this.steps.length - 1) {
          this.pointer++;
        }
        this.emitUpdate("paused");
        this.log?.log("Skip forward", { step: this.currentStepName() });
        break;
      default:
        break;
    }
  }

  private currentStepName(): string {
    const step = this.steps[this.pointer];
    if (!step) return "done";
    return step.name;
  }

  private emitUpdate(state: StepUpdate["state"]): void {
    this.sendUpdate({
      current: this.pointer + 1,
      total: this.steps.length,
      name: this.currentStepName(),
      state,
    });
  }

  private emitErrorUpdate(error: string): void {
    this.sendUpdate({
      current: this.pointer + 1,
      total: this.steps.length,
      name: this.currentStepName(),
      state: "failed",
      error,
    });
  }
}
