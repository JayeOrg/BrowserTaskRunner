import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createTaskLogger,
  createPrefixLogger,
  type LogOutput,
} from "../../../stack/framework/logging.js";
import { StepError } from "../../../stack/framework/errors.js";

// eslint-disable-next-line no-control-regex, sonarjs/no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/gu;

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
    expect(plain).toContain("→ url=https://x.com");
  });

  it("formats multiple data values as key=value", () => {
    const logger = createTaskLogger("task", output);
    logger.log("step", "msg", { aaa: "1", bbb: "2" });
    const plain = stripAnsi(lines[0]!);
    expect(plain).toContain("aaa=1");
    expect(plain).toContain("bbb=2");
  });

  it("fatal() throws StepError", () => {
    const logger = createTaskLogger("myTask", output);
    expect(() => logger.fatal("login", "timeout")).toThrow(StepError);
  });

  it("fatal() logs before throwing", () => {
    const logger = createTaskLogger("myTask", output);
    try {
      logger.fatal("login", "timeout");
    } catch {
      // Expected to throw
    }
    expect(lines).toHaveLength(1);
    expect(stripAnsi(lines[0]!)).toContain("timeout");
  });

  it("fatal() accepts StepErrorMeta with summary", () => {
    const logger = createTaskLogger("myTask", output);
    try {
      logger.fatal("login", "TIMEOUT", { summary: "could not reach server" });
    } catch (error) {
      expect(error).toBeInstanceOf(StepError);
      if (error instanceof StepError) {
        expect(error.meta.summary).toBe("could not reach server");
      }
    }
    expect(lines).toHaveLength(1);
    expect(stripAnsi(lines[0]!)).toContain("→ summary=could not reach server");
  });

  it("scoped fatal() accepts StepErrorMeta with summary", () => {
    const logger = createTaskLogger("myTask", output);
    const scoped = logger.scoped("login");
    try {
      scoped.fatal("TIMEOUT", { summary: "could not reach server" });
    } catch (error) {
      expect(error).toBeInstanceOf(StepError);
      if (error instanceof StepError) {
        expect(error.meta.summary).toBe("could not reach server");
      }
    }
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

  it("formats object data values as JSON", () => {
    const logger = createTaskLogger("task", output);
    logger.log("step", "msg", { nested: { a: 1 } });
    const plain = stripAnsi(lines[0]!);
    expect(plain).toContain('nested={"a":1}');
  });

  it("scoped().log delegates to the correct step", () => {
    const logger = createTaskLogger("task", output);
    const scoped = logger.scoped("myStep");
    scoped.log("hello");
    const plain = stripAnsi(lines[0]!);
    expect(plain).toContain("[1 myStep]");
    expect(plain).toContain("hello");
  });

  it("scoped().success outputs success icon", () => {
    const logger = createTaskLogger("task", output);
    const scoped = logger.scoped("myStep");
    scoped.success("done");
    const plain = stripAnsi(lines[0]!);
    expect(plain).toContain("done");
  });

  it("scoped().warn outputs warning", () => {
    const logger = createTaskLogger("task", output);
    const scoped = logger.scoped("myStep");
    scoped.warn("careful");
    const plain = stripAnsi(lines[0]!);
    expect(plain).toContain("careful");
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
