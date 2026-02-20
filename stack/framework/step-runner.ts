import { noopLogger, type PrefixLogger, type StepLogger, type TaskLogger } from "./logging.js";
import { StepError, toErrorMessage } from "./errors.js";

export interface StepUpdate {
  current: number;
  total: number;
  name: string;
  state: "idle" | "running" | "paused" | "failed" | "done";
  error?: string;
}

// Keep in sync with stack/extension/control-action.ts
type ControlAction = "pause" | "play" | "skipBack" | "skipForward";

interface StepDefinition {
  name: string;
  fn: (log: StepLogger) => Promise<void>;
  skip?: (() => boolean) | undefined;
}

interface Gate {
  promise: Promise<void>;
  open: () => void;
}

function createGate(): Gate {
  let resolver!: () => void;
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
  frameworkLogger?: PrefixLogger;
  taskLogger: TaskLogger;
  pauseOnError?: boolean;
}

export type StepFn<Args extends unknown[]> = (log: StepLogger, ...args: Args) => Promise<void>;

export class StepRunner {
  private steps: StepDefinition[] = [];
  private pointer = 0;
  private paused = false;
  private gate: Gate = createGate();
  private readonly sendUpdate: (update: StepUpdate) => void;
  private readonly log: PrefixLogger;
  private readonly pauseOnError: boolean;
  private readonly taskLogger: TaskLogger;
  private executed = false;

  constructor(deps: StepRunnerDeps) {
    this.sendUpdate = deps.sendStepUpdate;
    this.log = deps.frameworkLogger ?? noopLogger;
    this.taskLogger = deps.taskLogger;
    this.pauseOnError = deps.pauseOnError ?? true;
    deps.onControl((raw) => {
      if (isControlAction(raw)) {
        this.handleControl(raw);
      }
    });
  }

  step<Args extends unknown[]>(fn: StepFn<Args>, ...args: Args): this {
    const name = fn.name;
    if (!name) {
      throw new Error(
        "Step function must be named (use a function declaration or const assignment, not an inline arrow)",
      );
    }
    this.steps.push({ name, fn: (log) => fn(log, ...args) });
    return this;
  }

  named<Args extends unknown[]>(subtitle: string, fn: StepFn<Args>, ...args: Args): this {
    const name = fn.name;
    if (!name) {
      throw new Error(
        "Step function must be named (use a function declaration or const assignment, not an inline arrow)",
      );
    }
    this.steps.push({ name: `${name}:${subtitle}`, fn: (log) => fn(log, ...args) });
    return this;
  }

  skipIf(predicate: () => boolean): this {
    const last = this.steps[this.steps.length - 1];
    if (!last) {
      throw new Error("skipIf() must follow a step() or named() call");
    }
    last.skip = predicate;
    return this;
  }

  conditionalStep<Args extends unknown[]>(
    condition: () => boolean,
    fn: StepFn<Args>,
    ...args: Args
  ): this {
    const name = fn.name;
    if (!name) {
      throw new Error(
        "Step function must be named (use a function declaration or const assignment, not an inline arrow)",
      );
    }
    this.steps.push({ name, fn: (log) => fn(log, ...args), skip: () => !condition() });
    return this;
  }

  async execute(): Promise<string> {
    if (this.executed) {
      throw new Error("StepRunner.execute() called twice");
    }
    this.executed = true;

    if (this.steps.length === 0) {
      this.log.warn("execute() called with no steps registered");
      return "";
    }

    this.pointer = 0;

    while (this.pointer < this.steps.length) {
      if (this.paused) {
        this.emitUpdate("paused");
        this.log.log("Paused", { step: this.currentStepName() });
        await this.gate.promise;
      }

      const idx = this.pointer;
      const step = this.steps[idx];

      if (!step) break;

      if (step.skip?.()) {
        this.log.log("Skipping step", { step: step.name });
        this.pointer++;
      } else {
        this.emitUpdate("running");
        this.log.log("Running step", {
          step: step.name,
          progress: `${String(idx + 1)}/${String(this.steps.length)}`,
        });

        let stepFailed = false;
        try {
          await step.fn(this.scopeStep(step.name));
        } catch (error) {
          // Only pause on expected task failures (StepError).
          // Programming errors (TypeError, ReferenceError) always propagate.
          if (!(error instanceof StepError) || !this.pauseOnError) throw error;

          const msg = toErrorMessage(error);
          this.log.error("Step failed", { step: step.name, error: msg });
          this.emitErrorUpdate(msg);

          this.paused = true;
          await this.gate.promise;
          stepFailed = true;
        }

        if (this.shouldAdvancePointer(stepFailed, idx)) {
          this.pointer++;
        }
      }
    }

    this.emitUpdate("done");
    return this.steps[this.steps.length - 1]?.name ?? "";
  }

  /**
   * Two independent reasons to leave the pointer where it is:
   *   1. stepFailed — StepError was caught and we paused; "play" should
   *      re-run this same step, not skip to the next one.
   *   2. this.pointer !== idx — a control action (skipBack/skipForward) arrived
   *      during the await and already moved the pointer; advancing would
   *      discard the user's intent.
   */
  private shouldAdvancePointer(stepFailed: boolean, startIdx: number): boolean {
    return !stepFailed && this.pointer === startIdx;
  }

  private handleControl(action: ControlAction): void {
    switch (action) {
      case "pause":
        this.paused = true;
        this.emitUpdate("paused");
        this.log.log("Pause requested");
        break;
      case "play":
        this.paused = false;
        this.gate.open();
        this.gate = createGate();
        this.log.log("Play requested");
        break;
      case "skipBack":
        this.paused = true;
        if (this.pointer > 0) {
          this.pointer--;
          this.log.log("Skip back", { step: this.currentStepName() });
        } else {
          this.log.log("Already at first step", { step: this.currentStepName() });
        }
        this.emitUpdate("paused");
        break;
      case "skipForward":
        this.paused = true;
        if (this.pointer < this.steps.length - 1) {
          this.pointer++;
          this.log.log("Skip forward", { step: this.currentStepName() });
        } else {
          this.log.log("Already at last step", { step: this.currentStepName() });
        }
        this.emitUpdate("paused");
        break;
    }
  }

  private scopeStep(name: string): StepLogger {
    return this.taskLogger.scoped(name);
  }

  private currentStepName(): string {
    const step = this.steps[this.pointer];
    if (!step) return "done";
    return step.name;
  }

  private emitUpdate(state: StepUpdate["state"]): void {
    this.sendUpdate({
      current: Math.min(this.pointer + 1, this.steps.length),
      total: this.steps.length,
      name: this.currentStepName(),
      state,
    });
  }

  private emitErrorUpdate(error: string): void {
    this.sendUpdate({
      current: Math.min(this.pointer + 1, this.steps.length),
      total: this.steps.length,
      name: this.currentStepName(),
      state: "failed",
      error,
    });
  }
}
