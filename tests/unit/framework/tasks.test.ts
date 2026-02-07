import { describe, it, expect } from "vitest";
import { findTask, type SingleAttemptTask } from "../../../stack/framework/tasks.js";

function makeTask(name: string): SingleAttemptTask {
  return {
    name,
    url: "https://example.com",
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
