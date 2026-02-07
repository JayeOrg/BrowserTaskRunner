import { describe, it, expect } from "vitest";
import { StepError, getErrorMessage } from "../../../stack/framework/errors.js";

describe("StepError", () => {
  it("formats message as task.step: reason", () => {
    const err = new StepError("myTask", "login", "timeout");
    expect(err.message).toBe("myTask.login: timeout");
  });

  it("sets name to StepError", () => {
    const err = new StepError("t", "s", "r");
    expect(err.name).toBe("StepError");
  });

  it("exposes task, step, reason as readonly properties", () => {
    const err = new StepError("myTask", "login", "timeout");
    expect(err.task).toBe("myTask");
    expect(err.step).toBe("login");
    expect(err.reason).toBe("timeout");
  });

  it("defaults meta to empty object", () => {
    const err = new StepError("t", "s", "r");
    expect(err.meta).toEqual({});
  });

  describe("toResult", () => {
    it("returns base failure result", () => {
      const err = new StepError("myTask", "login", "timeout");
      expect(err.toResult()).toEqual({
        ok: false,
        step: "login",
        reason: "timeout",
        context: { task: "myTask" },
      });
    });

    it("includes finalUrl when present", () => {
      const err = new StepError("t", "s", "r", { finalUrl: "https://example.com" });
      const result = err.toResult();
      expect(result.finalUrl).toBe("https://example.com");
    });

    it("includes details when present", () => {
      const err = new StepError("t", "s", "r", { details: "extra info" });
      const result = err.toResult();
      expect(result.details).toBe("extra info");
    });

    it("omits finalUrl and details when not in meta", () => {
      const err = new StepError("t", "s", "r");
      const result = err.toResult();
      expect(result).not.toHaveProperty("finalUrl");
      expect(result).not.toHaveProperty("details");
    });

    it("merges meta.context with task name", () => {
      const err = new StepError("t", "s", "r", { context: { extra: "data" } });
      const result = err.toResult();
      expect(result.context).toEqual({ task: "t", extra: "data" });
    });
  });
});

describe("getErrorMessage", () => {
  it("returns message from Error instances", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns string representation of non-Error values", () => {
    expect(getErrorMessage("string error")).toBe("string error");
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage(null)).toBe("null");
    expect(getErrorMessage(undefined)).toBe("undefined");
  });
});
