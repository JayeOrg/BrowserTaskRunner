import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  validateSecrets,
  normalizeNeeds,
  needsFromSchema,
  type SingleAttemptTask,
} from "../../../stack/framework/tasks.js";

function makeTask(name: string): SingleAttemptTask {
  return {
    name,
    displayUrl: "https://example.com",
    project: "test-project",
    needs: {},
    mode: "once",
    run: async () => ({ lastCompletedStep: "done" }),
  };
}

describe("secretsSchema validation", () => {
  it("valid secrets passes safeParse", () => {
    const task: SingleAttemptTask = {
      ...makeTask("schema-test"),
      secretsSchema: z.object({ email: z.string() }),
    };

    const result = task.secretsSchema?.safeParse({ email: "test@test.com" });
    expect(result?.success).toBe(true);
  });

  it("mismatched secrets fails safeParse", () => {
    const task: SingleAttemptTask = {
      ...makeTask("schema-test"),
      secretsSchema: z.object({ email: z.string() }),
    };

    const result = task.secretsSchema?.safeParse({ wrong: 42 });
    expect(result?.success).toBe(false);
  });
});

describe("validateSecrets", () => {
  it("does nothing when task has no secretsSchema", () => {
    const task = makeTask("no-schema");
    expect(() => {
      validateSecrets(task, { anything: "goes" });
    }).not.toThrow();
  });

  it("passes when secrets matches schema", () => {
    const task: SingleAttemptTask = {
      ...makeTask("valid"),
      secretsSchema: z.object({ email: z.string() }),
    };
    expect(() => {
      validateSecrets(task, { email: "user@test.com" });
    }).not.toThrow();
  });

  it("throws with task name when secrets fails validation", () => {
    const task: SingleAttemptTask = {
      ...makeTask("my-task"),
      secretsSchema: z.object({ email: z.string() }),
    };
    expect(() => {
      validateSecrets(task, { wrong: "key" });
    }).toThrow('Secrets validation failed for "my-task"');
  });

  it("includes Zod error details in the message", () => {
    const task: SingleAttemptTask = {
      ...makeTask("schema-task"),
      secretsSchema: z.object({ count: z.number() }),
    };
    expect(() => {
      validateSecrets(task, { count: "not-a-number" });
    }).toThrow("Secrets validation");
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
