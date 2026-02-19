import { describe, it, expect } from "vitest";
import { StepError, toErrorMessage } from "../../../stack/framework/errors.js";

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

  it("stores summary in meta", () => {
    const err = new StepError("t", "s", "r", { summary: "extra info" });
    expect(err.meta.summary).toBe("extra info");
  });

  it("stores diagnostics in meta", () => {
    const err = new StepError("t", "s", "r", { diagnostics: { extra: "data" } });
    expect(err.meta.diagnostics).toEqual({ extra: "data" });
  });
});

describe("toErrorMessage", () => {
  it("returns message from Error instances", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns string representation of non-Error values", () => {
    expect(toErrorMessage("string error")).toBe("string error");
    expect(toErrorMessage(42)).toBe("42");
    expect(toErrorMessage(null)).toBe("null");
    expect(toErrorMessage(undefined)).toBe("undefined");
  });
});
