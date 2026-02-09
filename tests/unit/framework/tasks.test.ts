import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  findTask,
  validateContext,
  executeRetry,
  type SingleAttemptTask,
  type RetryingTask,
} from "../../../stack/framework/tasks.js";
import { StepError } from "../../../stack/framework/errors.js";
import { createTaskLogger } from "../../../stack/framework/logging.js";
import { createMockBrowser } from "../../unit/projects/utils/testing.js";

const noopLogger = createTaskLogger("test", () => undefined);

function makeTask(name: string): SingleAttemptTask {
  return {
    name,
    url: "https://example.com",
    project: "test-project",
    needs: {},
    mode: "once",
    run: async () => ({ ok: true, step: "done" }),
  };
}

describe("findTask", () => {
  it("returns matching task by name", () => {
    const tasks = [makeTask("alpha"), makeTask("beta")];
    expect(findTask("beta", tasks).name).toBe("beta");
  });

  it("throws for unknown task name", () => {
    const tasks = [makeTask("alpha")];
    expect(() => findTask("nope", tasks)).toThrow('Unknown task: "nope"');
  });

  it("includes available names in error message", () => {
    const tasks = [makeTask("alpha"), makeTask("beta")];
    expect(() => findTask("x", tasks)).toThrow("Available: alpha, beta");
  });
});

describe("contextSchema validation", () => {
  it("valid context passes safeParse", () => {
    const task: SingleAttemptTask = {
      ...makeTask("schema-test"),
      contextSchema: z.object({ email: z.string() }),
    };

    const result = task.contextSchema?.safeParse({ email: "test@test.com" });
    expect(result?.success).toBe(true);
  });

  it("mismatched context fails safeParse", () => {
    const task: SingleAttemptTask = {
      ...makeTask("schema-test"),
      contextSchema: z.object({ email: z.string() }),
    };

    const result = task.contextSchema?.safeParse({ wrong: 42 });
    expect(result?.success).toBe(false);
  });
});

describe("validateContext", () => {
  it("does nothing when task has no contextSchema", () => {
    const task = makeTask("no-schema");
    expect(() => {
      validateContext(task, { anything: "goes" });
    }).not.toThrow();
  });

  it("passes when context matches schema", () => {
    const task: SingleAttemptTask = {
      ...makeTask("valid"),
      contextSchema: z.object({ email: z.string() }),
    };
    expect(() => {
      validateContext(task, { email: "user@test.com" });
    }).not.toThrow();
  });

  it("throws with task name when context fails validation", () => {
    const task: SingleAttemptTask = {
      ...makeTask("my-task"),
      contextSchema: z.object({ email: z.string() }),
    };
    expect(() => {
      validateContext(task, { wrong: "key" });
    }).toThrow('Context validation failed for "my-task"');
  });

  it("includes Zod error details in the message", () => {
    const task: SingleAttemptTask = {
      ...makeTask("schema-task"),
      contextSchema: z.object({ count: z.number() }),
    };
    expect(() => {
      validateContext(task, { count: "not-a-number" });
    }).toThrow("Context validation");
  });
});

describe("executeRetry", () => {
  it("returns immediately on first success", async () => {
    const delays: number[] = [];
    const task: RetryingTask = {
      name: "instant",
      url: "https://test",
      project: "test",
      needs: {},
      mode: "retry",
      intervalMs: 100,
      run: async () => ({ ok: true, step: "done" }),
    };

    const result = await executeRetry(task, createMockBrowser(), {}, noopLogger, async (ms) => {
      delays.push(ms);
    });

    expect(result.ok).toBe(true);
    expect(delays).toEqual([]);
  });

  it("retries on error and succeeds on later attempt", async () => {
    let attempt = 0;
    const delays: number[] = [];
    const task: RetryingTask = {
      name: "retry-test",
      url: "https://test",
      project: "test",
      needs: {},
      mode: "retry",
      intervalMs: 50,
      run: async () => {
        attempt++;
        if (attempt < 3) {
          throw new StepError("retry-test", "check", "NOT_READY");
        }
        return { ok: true, step: "done" };
      },
    };

    const result = await executeRetry(task, createMockBrowser(), {}, noopLogger, async (ms) => {
      delays.push(ms);
    });

    expect(result.ok).toBe(true);
    expect(attempt).toBe(3);
    expect(delays).toEqual([50, 50]);
  });

  it("retries on non-StepError exceptions too", async () => {
    let attempt = 0;
    const task: RetryingTask = {
      name: "generic-error",
      url: "https://test",
      project: "test",
      needs: {},
      mode: "retry",
      intervalMs: 10,
      run: async () => {
        attempt++;
        if (attempt === 1) {
          throw new Error("network failure");
        }
        return { ok: true, step: "done" };
      },
    };

    const result = await executeRetry(
      task,
      createMockBrowser(),
      {},
      noopLogger,
      async () => undefined,
    );

    expect(result.ok).toBe(true);
    expect(attempt).toBe(2);
  });

  it("passes context through to task.run", async () => {
    let receivedContext: Record<string, string> = {};
    const task: RetryingTask = {
      name: "ctx-test",
      url: "https://test",
      project: "test",
      needs: {},
      mode: "retry",
      intervalMs: 10,
      run: async (_browser, context) => {
        receivedContext = context;
        return { ok: true, step: "done" };
      },
    };

    await executeRetry(
      task,
      createMockBrowser(),
      { key: "value" },
      noopLogger,
      async () => undefined,
    );

    expect(receivedContext).toEqual({ key: "value" });
  });

  it("uses task.intervalMs for each delay", async () => {
    let attempt = 0;
    const delays: number[] = [];
    const task: RetryingTask = {
      name: "interval-test",
      url: "https://test",
      project: "test",
      needs: {},
      mode: "retry",
      intervalMs: 999,
      run: async () => {
        attempt++;
        if (attempt <= 2) throw new Error("not yet");
        return { ok: true, step: "done" };
      },
    };

    await executeRetry(task, createMockBrowser(), {}, noopLogger, async (ms) => {
      delays.push(ms);
    });

    expect(delays).toEqual([999, 999]);
  });
});
