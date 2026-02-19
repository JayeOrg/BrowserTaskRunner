import { describe, it, expect } from "vitest";
import {
  StepRunner,
  type StepUpdate,
  type StepRunnerDeps,
} from "../../../stack/framework/step-runner.js";
import { StepError } from "../../../stack/framework/errors.js";
import { createTaskLogger } from "../../../stack/framework/logging.js";

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

function tick(ms = 10): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("StepRunner execution", () => {
  it("executes steps in sequence", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    const order: string[] = [];

    runner
      .step("a", async () => {
        order.push("a");
      })
      .step("b", async () => {
        order.push("b");
      });

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

    runner.step("only", async () => {});

    await runner.execute();
    expect(updates).toEqual([
      { current: 1, total: 1, name: "only", state: "running" },
      { current: 1, total: 1, name: "done", state: "done" },
    ]);
  });

  it("emits correct current/total for multiple steps", async () => {
    const { deps, updates } = createDeps();
    const runner = new StepRunner(deps);

    runner.step("a", async () => {}).step("b", async () => {});

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

    runner.step("fail", async () => {
      throw new Error("boom");
    });

    await expect(runner.execute()).rejects.toThrow("boom");
  });

  it("step() returns this for chaining", () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);

    const result = runner.step("x", async () => {});
    expect(result).toBe(runner);
  });

  it("skips a step when skip returns true", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    const order: string[] = [];

    runner
      .step("a", async () => {
        order.push("a");
      })
      .step(
        "b",
        async () => {
          order.push("b");
        },
        { skip: () => true },
      )
      .step("c", async () => {
        order.push("c");
      });

    await runner.execute();
    expect(order).toEqual(["a", "c"]);
  });

  it("runs step when skip returns false", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    const order: string[] = [];

    runner
      .step(
        "a",
        async () => {
          order.push("a");
        },
        { skip: () => false },
      )
      .step("b", async () => {
        order.push("b");
      });

    await runner.execute();
    expect(order).toEqual(["a", "b"]);
  });

  it("evaluates skip at execution time not registration time", async () => {
    const { deps } = createDeps();
    const runner = new StepRunner(deps);
    let shouldSkip = false;
    const order: string[] = [];

    runner
      .step("a", async () => {
        order.push("a");
        shouldSkip = true;
      })
      .step(
        "b",
        async () => {
          order.push("b");
        },
        { skip: () => shouldSkip },
      );

    await runner.execute();
    expect(order).toEqual(["a"]);
  });
});

describe("StepRunner pause/play", () => {
  it("pause prevents next step until play", async () => {
    const { deps, sendControl } = createDeps();
    const runner = new StepRunner(deps);
    const order: string[] = [];

    runner
      .step("a", async () => {
        order.push("a");
        sendControl("pause");
      })
      .step("b", async () => {
        order.push("b");
      });

    const done = runner.execute();

    await tick();
    expect(order).toEqual(["a"]);

    sendControl("play");
    await done;
    expect(order).toEqual(["a", "b"]);
  });

  it("emits paused update when pausing between steps", async () => {
    const { deps, updates, sendControl } = createDeps();
    const runner = new StepRunner(deps);

    runner
      .step("a", async () => {
        sendControl("pause");
      })
      .step("b", async () => {});

    const done = runner.execute();
    await tick();

    expect(updates.some((entry) => entry.state === "paused")).toBe(true);

    sendControl("play");
    await done;
  });

  it("ignores non-control action strings", async () => {
    const { deps, updates, sendControl } = createDeps();
    const runner = new StepRunner(deps);

    runner.step("a", async () => {
      sendControl("unknown-action");
    });

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

    runner
      .step("a", async () => {
        order.push("a");
        sendControl("pause");
      })
      .step("b", async () => {
        order.push("b");
      })
      .step("c", async () => {
        order.push("c");
      });

    const done = runner.execute();
    await tick();
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

    runner
      .step("a", async () => {
        order.push("a");
      })
      .step("b", async () => {
        order.push("b");
        if (pauseOnB) {
          pauseOnB = false;
          sendControl("pause");
        }
      })
      .step("c", async () => {
        order.push("c");
      });

    const done = runner.execute();
    await tick();
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

    runner.step("only", async () => {
      sendControl("pause");
    });

    const done = runner.execute();
    await tick();

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

    runner
      .step("a", async () => {
        sendControl("pause");
      })
      .step("b", async () => {});

    const done = runner.execute();
    await tick();

    // Step index 1 -> 1 (already at last step)
    sendControl("skipForward");

    const lastPaused = updates.filter((entry) => entry.state === "paused").pop();
    expect(lastPaused?.name).toBe("b");

    sendControl("play");
    await done;
  });
});

describe("StepRunner pauseOnError", () => {
  it("pauses on StepError and re-runs step after play", async () => {
    const { deps, updates, sendControl } = createDeps();
    const runner = new StepRunner(deps);
    let calls = 0;

    runner.step("flaky", async () => {
      calls++;
      if (calls === 1) throw new StepError("test", "flaky", "first try fails");
    });

    const done = runner.execute();
    await tick();

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

    runner.step("fail", async () => {
      throw new StepError("test", "fail", "immediate");
    });

    await expect(runner.execute()).rejects.toThrow("immediate");
  });

  it("rethrows non-StepError even when pauseOnError is true", async () => {
    const { deps } = createDeps({ pauseOnError: true });
    const runner = new StepRunner(deps);

    runner.step("buggy", async () => {
      throw new TypeError("Cannot read properties of undefined");
    });

    await expect(runner.execute()).rejects.toThrow("Cannot read properties of undefined");
  });
});
