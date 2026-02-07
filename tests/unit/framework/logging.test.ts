import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createTaskLogger,
  createPrefixLogger,
  type LogOutput,
} from "../../../stack/framework/logging.js";
import { StepError } from "../../../stack/framework/errors.js";

// eslint-disable-next-line no-control-regex, require-unicode-regexp, sonarjs/no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_PATTERN, "");
}

describe("createTaskLogger", () => {
  let lines: string[];
  let output: LogOutput;

  beforeEach(() => {
    vi.useFakeTimers();
    lines = [];
    output = (msg) => lines.push(msg);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes step name and message in output", () => {
    const logger = createTaskLogger("task", output);
    logger.log("init", "starting up");
    const plain = stripAnsi(lines[0]!);
    expect(plain).toContain("[1 init]");
    expect(plain).toContain("starting up");
  });

  it("increments step number when step name changes", () => {
    const logger = createTaskLogger("task", output);
    logger.log("step1", "a");
    logger.log("step2", "b");
    expect(stripAnsi(lines[0]!)).toContain("[1 step1]");
    expect(stripAnsi(lines[1]!)).toContain("[2 step2]");
  });

  it("keeps step number for same step name", () => {
    const logger = createTaskLogger("task", output);
    logger.log("init", "a");
    logger.log("init", "b");
    expect(stripAnsi(lines[1]!)).toContain("[1 init]");
  });

  it("formats single data value with arrow", () => {
    const logger = createTaskLogger("task", output);
    logger.log("step", "msg", { url: "https://x.com" });
    const plain = stripAnsi(lines[0]!);
    expect(plain).toContain("→ https://x.com");
  });

  it("formats multiple data values as key=value", () => {
    const logger = createTaskLogger("task", output);
    logger.log("step", "msg", { aaa: "1", bbb: "2" });
    const plain = stripAnsi(lines[0]!);
    expect(plain).toContain("aaa=1");
    expect(plain).toContain("bbb=2");
  });

  it("fail() throws StepError", () => {
    const logger = createTaskLogger("myTask", output);
    expect(() => logger.fail("login", "timeout")).toThrow(StepError);
  });

  it("fail() logs before throwing", () => {
    const logger = createTaskLogger("myTask", output);
    try {
      logger.fail("login", "timeout");
    } catch {
      // Expected to throw
    }
    expect(lines).toHaveLength(1);
    expect(stripAnsi(lines[0]!)).toContain("timeout");
  });

  it("includes duration in output", () => {
    const logger = createTaskLogger("task", output);
    logger.log("step", "first");
    vi.advanceTimersByTime(1500);
    logger.log("step", "second");
    expect(stripAnsi(lines[1]!)).toContain("1.5s");
  });

  it("formats duration over 60s as M:SS", () => {
    const logger = createTaskLogger("task", output);
    logger.log("step", "first");
    vi.advanceTimersByTime(90_000);
    logger.log("step", "second");
    expect(stripAnsi(lines[1]!)).toContain("1:30");
  });
});

describe("default output", () => {
  it("uses console.log when no output function is provided", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createTaskLogger("task");
    logger.log("step", "hello");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toContain("hello");
    spy.mockRestore();
  });
});

describe("createPrefixLogger", () => {
  it("includes prefix in output", () => {
    const lines: string[] = [];
    const logger = createPrefixLogger("MyPrefix", (msg) => lines.push(msg));
    logger.log("hello");
    expect(stripAnsi(lines[0]!)).toContain("[MyPrefix]");
  });

  it("supports all four log levels", () => {
    const lines: string[] = [];
    const logger = createPrefixLogger("P", (msg) => lines.push(msg));
    logger.log("a");
    logger.success("b");
    logger.warn("c");
    logger.error("d");
    expect(lines).toHaveLength(4);
  });
});
