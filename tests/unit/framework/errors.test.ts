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

  it("stores finalUrl in meta", () => {
    const err = new StepError("t", "s", "r", { finalUrl: "https://example.com" });
    expect(err.meta.finalUrl).toBe("https://example.com");
  });

  it("stores details in meta", () => {
    const err = new StepError("t", "s", "r", { details: "extra info" });
    expect(err.meta.details).toBe("extra info");
  });

  it("stores context in meta", () => {
    const err = new StepError("t", "s", "r", { context: { extra: "data" } });
    expect(err.meta.context).toEqual({ extra: "data" });
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
