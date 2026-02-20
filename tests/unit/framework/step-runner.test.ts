import { describe, it, expect } from "vitest";
import {
  StepRunner,
  type StepUpdate,
  type StepRunnerDeps,
} from "../../../stack/framework/step-runner.js";
import { StepError } from "../../../stack/framework/errors.js";
import { createTaskLogger, type StepLogger } from "../../../stack/framework/logging.js";

function createDeps(overrides?: Partial<StepRunnerDeps>): {
  deps: StepRunnerDeps;
  updates: StepUpdate[];
  sendControl: (action: string) => void;
} {
  const updates: StepUpdate[] = [];
  let controlHandler: ((action: string) => void) | null = null;

  const deps: StepRunnerDeps = {
    sendStepUpdate: (update) => updates.push(update),
    onControl: (handler) => {
      controlHandler = handler;
    },
    taskLogger: createTaskLogger("test", () => undefined),
    ...overrides,
  };

  return {
    deps,
    updates,
    sendControl: (action: string) => {
      controlHandler?.(action);
    },
  };
}

function settleAsync(ms = 10): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("StepRunner execution", () => {
  it("executes steps in sequence", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    const order: string[] = [];

    async function a(_log: StepLogger) {
      order.push("a");
    }
    async function b(_log: StepLogger) {
      order.push("b");
    }

    runner.step(a).step(b);

    await runner.execute();
    expect(order).toEqual(["a", "b"]);
  });

  it("returns immediately for empty steps", async () => {
    const { deps, updates } = createDeps();
    const runner = new StepRunner(deps);

    await runner.execute();
    expect(updates).toEqual([]);
  });

  it("emits running then done updates", async () => {
    const { deps, updates } = createDeps();
    const runner = new StepRunner(deps);

    async function only(_log: StepLogger) {}

    runner.step(only);

    await runner.execute();
    expect(updates).toEqual([
      { current: 1, total: 1, name: "only", state: "running" },
      { current: 1, total: 1, name: "done", state: "done" },
    ]);
  });

  it("emits correct current/total for multiple steps", async () => {
    const { deps, updates } = createDeps();
    const runner = new StepRunner(deps);

    async function a(_log: StepLogger) {}
    async function b(_log: StepLogger) {}

    runner.step(a).step(b);

    await runner.execute();

    const running = updates.filter((entry) => entry.state === "running");
    expect(running).toEqual([
      { current: 1, total: 2, name: "a", state: "running" },
      { current: 2, total: 2, name: "b", state: "running" },
    ]);
  });

  it("throws step errors when pauseOnError is false", async () => {
    const { deps } = createDeps({ pauseOnError: false });
    const runner = new StepRunner(deps);

    async function fail(_log: StepLogger) {
      throw new Error("boom");
    }

    runner.step(fail);

    await expect(runner.execute()).rejects.toThrow("boom");
  });

  it("step() returns this for chaining", () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);

    async function x(_log: StepLogger) {}

    const result = runner.step(x);
    expect(result).toBe(runner);
  });

  it("rejects anonymous functions", () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);

    expect(() => runner.step(async () => {})).toThrow("Step function must be named");
  });

  it("derives step name from function name", async () => {
    const { deps, updates } = createDeps();
    const runner = new StepRunner(deps);

    async function myStepName(_log: StepLogger) {}

    runner.step(myStepName);
    await runner.execute();

    expect(updates[0]?.name).toBe("myStepName");
  });

  it("passes extra args to step function", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    const received: unknown[] = [];

    async function greet(_log: StepLogger, name: string, count: number) {
      received.push(name, count);
    }

    runner.step(greet, "world", 42);
    await runner.execute();

    expect(received).toEqual(["world", 42]);
  });

  it("returns last step name from execute()", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);

    async function first(_log: StepLogger) {}
    async function last(_log: StepLogger) {}

    runner.step(first).step(last);

    const result = await runner.execute();
    expect(result).toBe("last");
  });
});

describe("StepRunner named()", () => {
  it("uses fn.name:subtitle as step name", async () => {
    const { deps, updates } = createDeps();
    const runner = new StepRunner(deps);

    async function addItem(_log: StepLogger, _name: string) {}

    runner.named("Burger", addItem, "Burger");
    await runner.execute();

    expect(updates[0]?.name).toBe("addItem:Burger");
  });

  it("returns last named step from execute()", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);

    async function doThing(_log: StepLogger) {}

    runner.named("final", doThing);

    const result = await runner.execute();
    expect(result).toBe("doThing:final");
  });
});

describe("StepRunner skipIf()", () => {
  it("skips a step when predicate returns true", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    const order: string[] = [];

    async function a(_log: StepLogger) {
      order.push("a");
    }
    async function b(_log: StepLogger) {
      order.push("b");
    }
    async function c(_log: StepLogger) {
      order.push("c");
    }

    runner
      .step(a)
      .step(b)
      .skipIf(() => true)
      .step(c);

    await runner.execute();
    expect(order).toEqual(["a", "c"]);
  });

  it("runs step when predicate returns false", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    const order: string[] = [];

    async function a(_log: StepLogger) {
      order.push("a");
    }
    async function b(_log: StepLogger) {
      order.push("b");
    }

    runner
      .step(a)
      .skipIf(() => false)
      .step(b);

    await runner.execute();
    expect(order).toEqual(["a", "b"]);
  });

  it("evaluates predicate at execution time not registration time", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    let shouldSkip = false;
    const order: string[] = [];

    async function a(_log: StepLogger) {
      order.push("a");
      shouldSkip = true;
    }
    async function b(_log: StepLogger) {
      order.push("b");
    }

    runner
      .step(a)
      .step(b)
      .skipIf(() => shouldSkip);

    await runner.execute();
    expect(order).toEqual(["a"]);
  });

  it("throws when called with no preceding step", () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);

    expect(() => runner.skipIf(() => true)).toThrow("skipIf() must follow");
  });
});

describe("StepRunner pause/play", () => {
  it("pause prevents next step until play", async () => {
    const { deps, sendControl } = createDeps();
    const runner = new StepRunner(deps);
    const order: string[] = [];

    async function a(_log: StepLogger) {
      order.push("a");
      sendControl("pause");
    }
    async function b(_log: StepLogger) {
      order.push("b");
    }

    runner.step(a).step(b);

    const done = runner.execute();

    await settleAsync();
    expect(order).toEqual(["a"]);

    sendControl("play");
    await done;
    expect(order).toEqual(["a", "b"]);
  });

  it("emits paused update when pausing between steps", async () => {
    const { deps, updates, sendControl } = createDeps();
    const runner = new StepRunner(deps);

    async function a(_log: StepLogger) {
      sendControl("pause");
    }
    async function b(_log: StepLogger) {}

    runner.step(a).step(b);

    const done = runner.execute();
    await settleAsync();

    expect(updates.some((entry) => entry.state === "paused")).toBe(true);

    sendControl("play");
    await done;
  });

  it("ignores non-control action strings", async () => {
    const { deps, updates, sendControl } = createDeps();
    const runner = new StepRunner(deps);

    async function a(_log: StepLogger) {
      sendControl("unknown-action");
    }

    runner.step(a);

    await runner.execute();

    // Unknown action was silently ignored — no paused updates
    expect(updates.every((entry) => entry.state !== "paused")).toBe(true);
  });
});

describe("StepRunner skipBack/skipForward", () => {
  it("skipForward skips a step during pause", async () => {
    const { deps, sendControl } = createDeps();
    const runner = new StepRunner(deps);
    const order: string[] = [];

    async function a(_log: StepLogger) {
      order.push("a");
      sendControl("pause");
    }
    async function b(_log: StepLogger) {
      order.push("b");
    }
    async function c(_log: StepLogger) {
      order.push("c");
    }

    runner.step(a).step(b).step(c);

    const done = runner.execute();
    await settleAsync();
    expect(order).toEqual(["a"]);

    // Step index 1 -> 2 (skip "b")
    sendControl("skipForward");
    sendControl("play");
    await done;

    expect(order).toEqual(["a", "c"]);
  });

  it("skipBack replays a step during pause", async () => {
    const { deps, sendControl } = createDeps();
    const runner = new StepRunner(deps);
    const order: string[] = [];
    let pauseOnB = true;

    async function a(_log: StepLogger) {
      order.push("a");
    }
    async function b(_log: StepLogger) {
      order.push("b");
      if (pauseOnB) {
        pauseOnB = false;
        sendControl("pause");
      }
    }
    async function c(_log: StepLogger) {
      order.push("c");
    }

    runner.step(a).step(b).step(c);

    const done = runner.execute();
    await settleAsync();
    expect(order).toEqual(["a", "b"]);

    // Step index 2 -> 1
    sendControl("skipBack");
    sendControl("play");
    await done;

    expect(order).toEqual(["a", "b", "b", "c"]);
  });

  it("skipBack does not go below 0", async () => {
    const { deps, updates, sendControl } = createDeps();
    const runner = new StepRunner(deps);

    async function only(_log: StepLogger) {
      sendControl("pause");
    }

    runner.step(only);

    const done = runner.execute();
    await settleAsync();

    // Step index 1 -> 0
    sendControl("skipBack");
    // Already at 0, stays
    sendControl("skipBack");

    const pausedNames = updates
      .filter((entry) => entry.state === "paused")
      .map((entry) => entry.name);
    expect(pausedNames.every((name) => name === "only")).toBe(true);

    sendControl("play");
    await done;
  });

  it("skipForward does not exceed last step", async () => {
    const { deps, updates, sendControl } = createDeps();
    const runner = new StepRunner(deps);

    async function a(_log: StepLogger) {
      sendControl("pause");
    }
    async function b(_log: StepLogger) {}

    runner.step(a).step(b);

    const done = runner.execute();
    await settleAsync();

    // Step index 1 -> 1 (already at last step)
    sendControl("skipForward");

    const lastPaused = updates.filter((entry) => entry.state === "paused").pop();
    expect(lastPaused?.name).toBe("b");

    sendControl("play");
    await done;
  });
});

describe("StepRunner conditionalStep()", () => {
  it("runs step when condition returns true", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    const order: string[] = [];

    async function a(_log: StepLogger) {
      order.push("a");
    }
    async function b(_log: StepLogger) {
      order.push("b");
    }

    runner.conditionalStep(() => true, a).conditionalStep(() => true, b);

    await runner.execute();
    expect(order).toEqual(["a", "b"]);
  });

  it("skips step when condition returns false", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    const order: string[] = [];

    async function a(_log: StepLogger) {
      order.push("a");
    }
    async function b(_log: StepLogger) {
      order.push("b");
    }

    runner.conditionalStep(() => true, a).conditionalStep(() => false, b);

    await runner.execute();
    expect(order).toEqual(["a"]);
  });

  it("evaluates condition at execution time", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    let shouldRun = false;
    const order: string[] = [];

    async function a(_log: StepLogger) {
      order.push("a");
      shouldRun = true;
    }
    async function b(_log: StepLogger) {
      order.push("b");
    }

    runner.step(a).conditionalStep(() => shouldRun, b);

    await runner.execute();
    expect(order).toEqual(["a", "b"]);
  });

  it("passes extra args to step function", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    const received: unknown[] = [];

    async function greet(_log: StepLogger, name: string) {
      received.push(name);
    }

    runner.conditionalStep(() => true, greet, "world");
    await runner.execute();

    expect(received).toEqual(["world"]);
  });

  it("rejects anonymous functions", () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);

    expect(() =>
      runner.conditionalStep(
        () => true,
        async () => {},
      ),
    ).toThrow("Step function must be named");
  });
});

describe("StepRunner execute() guard", () => {
  it("throws when called twice", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);

    async function a(_log: StepLogger) {}

    runner.step(a);
    await runner.execute();

    await expect(runner.execute()).rejects.toThrow("StepRunner.execute() called twice");
  });
});

describe("StepRunner pauseOnError", () => {
  it("pauses on StepError and re-runs step after play", async () => {
    const { deps, updates, sendControl } = createDeps();
    const runner = new StepRunner(deps);
    let calls = 0;

    async function flaky(_log: StepLogger) {
      calls++;
      if (calls === 1) throw new StepError("test", "flaky", "first try fails");
    }

    runner.step(flaky);

    const done = runner.execute();
    await settleAsync();

    const failedUpdate = updates.find((entry) => entry.state === "failed");
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate?.error).toBe("test.flaky: first try fails");

    // Resume — pointer didn't advance, so the step re-runs
    sendControl("play");
    await done;

    expect(calls).toBe(2);
  });

  it("throws when pauseOnError is false", async () => {
    const { deps } = createDeps({ pauseOnError: false });
    const runner = new StepRunner(deps);

    async function fail(_log: StepLogger) {
      throw new StepError("test", "fail", "immediate");
    }

    runner.step(fail);

    await expect(runner.execute()).rejects.toThrow("immediate");
  });

  it("rethrows non-StepError even when pauseOnError is true", async () => {
    const { deps } = createDeps({ pauseOnError: true });
    const runner = new StepRunner(deps);

    async function buggy(_log: StepLogger) {
      throw new TypeError("Cannot read properties of undefined");
    }

    runner.step(buggy);

    await expect(runner.execute()).rejects.toThrow("Cannot read properties of undefined");
  });
});
