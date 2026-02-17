import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  validateContext,
  normalizeNeeds,
  needsFromSchema,
  type SingleAttemptTask,
} from "../../../stack/framework/tasks.js";

function makeTask(name: string): SingleAttemptTask {
  return {
    name,
    url: "https://example.com",
    project: "test-project",
    needs: {},
    mode: "once",
    run: async () => ({ step: "done" }),
  };
}

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

describe("normalizeNeeds", () => {
  it("converts array to identity record", () => {
    expect(normalizeNeeds(["email", "password"])).toEqual({
      email: "email",
      password: "password",
    });
  });

  it("passes record through unchanged", () => {
    const needs = { loginEmail: "email", loginPassword: "password" };
    expect(normalizeNeeds(needs)).toEqual(needs);
  });

  it("handles empty array", () => {
    expect(normalizeNeeds([])).toEqual({});
  });

  it("handles empty record", () => {
    expect(normalizeNeeds({})).toEqual({});
  });
});

describe("needsFromSchema", () => {
  it("extracts keys from a zod object schema", () => {
    const schema = z.object({ email: z.string(), password: z.string() });
    expect(needsFromSchema(schema)).toEqual({
      email: "email",
      password: "password",
    });
  });

  it("returns empty record for non-object schema", () => {
    expect(needsFromSchema(z.string())).toEqual({});
  });
});
