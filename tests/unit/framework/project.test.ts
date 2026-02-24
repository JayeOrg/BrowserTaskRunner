import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { defineProject } from "../../../stack/framework/project.js";
import type { StepLogger } from "../../../stack/framework/logging.js";
import type { BrowserAPI } from "../../../stack/browser/browser.js";
import { stubBrowserAPI } from "../../fixtures/mock-browser.js";
import { noopDeps } from "../../fixtures/test-helpers.js";

const testSchema = z.object({
  email: z.string(),
  password: z.string(),
});

type Secrets = z.infer<typeof testSchema>;

describe("defineProject", () => {
  it("produces a ProjectConfig with correct name and tasks", () => {
    async function step1(_log: StepLogger, _browser: BrowserAPI, _secrets: Secrets) {}

    const project = defineProject({
      name: "test-project",
      tasks: [
        {
          name: "taskA",
          displayUrl: "https://example.com",
          secretsSchema: testSchema,
          mode: "once",
          steps: [step1],
        },
      ],
    });

    expect(project.name).toBe("test-project");
    expect(project.tasks).toHaveLength(1);
    expect(project.tasks[0]!.name).toBe("taskA");
  });

  it("injects project name into each task", () => {
    async function step1(_log: StepLogger, _browser: BrowserAPI, _secrets: Secrets) {}

    const project = defineProject({
      name: "my-project",
      tasks: [
        {
          name: "taskA",
          displayUrl: "https://a.com",
          secretsSchema: testSchema,
          mode: "once",
          steps: [step1],
        },
        {
          name: "taskB",
          displayUrl: "https://b.com",
          secretsSchema: testSchema,
          mode: "retry",
          intervalMs: 5000,
          steps: [step1],
        },
      ],
    });

    expect(project.tasks[0]!.project).toBe("my-project");
    expect(project.tasks[1]!.project).toBe("my-project");
  });

  it("collects multiple tasks", () => {
    async function step1(_log: StepLogger, _browser: BrowserAPI, _secrets: Secrets) {}

    const project = defineProject({
      name: "multi",
      tasks: [
        {
          name: "taskA",
          displayUrl: "https://a.com",
          secretsSchema: testSchema,
          mode: "once",
          steps: [step1],
        },
        {
          name: "taskB",
          displayUrl: "https://b.com",
          secretsSchema: testSchema,
          mode: "retry",
          intervalMs: 1000,
          steps: [step1],
        },
      ],
    });

    expect(project.tasks).toHaveLength(2);
    expect(project.tasks.map((t) => t.name)).toEqual(["taskA", "taskB"]);
  });

  it("task() lookup returns correct TaskConfig", () => {
    async function step1(_log: StepLogger, _browser: BrowserAPI, _secrets: Secrets) {}

    const project = defineProject({
      name: "lookup-test",
      tasks: [
        {
          name: "alpha",
          displayUrl: "https://a.com",
          secretsSchema: testSchema,
          mode: "once",
          steps: [step1],
        },
        {
          name: "beta",
          displayUrl: "https://b.com",
          secretsSchema: testSchema,
          mode: "retry",
          intervalMs: 5000,
          steps: [step1],
        },
      ],
    });

    expect(project.task("alpha").name).toBe("alpha");
    expect(project.task("beta").name).toBe("beta");
  });

  it("task() throws for unknown task name", () => {
    const project = defineProject({
      name: "empty-ish",
      tasks: [],
    });

    expect(() => project.task("nonexistent")).toThrow(
      'No task "nonexistent" in project "empty-ish"',
    );
  });

  it("works with custom run mode", async () => {
    const customRun = vi.fn().mockResolvedValue("done");

    const project = defineProject({
      name: "custom-project",
      tasks: [
        {
          name: "customTask",
          displayUrl: "https://example.com",
          secretsSchema: testSchema,
          mode: "once",
          run: customRun,
        },
      ],
    });

    const browser = stubBrowserAPI();
    await project.task("customTask").run(browser, { email: "a", password: "b" }, noopDeps);
    expect(customRun).toHaveBeenCalled();
  });

  it("derives needs from secretsSchema for each task", () => {
    async function step1(_log: StepLogger, _browser: BrowserAPI, _secrets: Secrets) {}

    const project = defineProject({
      name: "needs-test",
      tasks: [
        {
          name: "taskA",
          displayUrl: "https://a.com",
          secretsSchema: testSchema,
          mode: "once",
          steps: [step1],
        },
      ],
    });

    expect(project.task("taskA").needs).toEqual({ email: "email", password: "password" });
  });

  it("preserves mode-specific fields", () => {
    async function step1(_log: StepLogger, _browser: BrowserAPI, _secrets: Secrets) {}

    const project = defineProject({
      name: "mode-test",
      tasks: [
        {
          name: "retryTask",
          displayUrl: "https://r.com",
          secretsSchema: testSchema,
          mode: "retry",
          intervalMs: 30_000,
          steps: [step1],
        },
        {
          name: "onceTask",
          displayUrl: "https://o.com",
          secretsSchema: testSchema,
          mode: "once",
          keepBrowserOpen: true,
          steps: [step1],
        },
      ],
    });

    const retry = project.task("retryTask");
    expect(retry.mode).toBe("retry");
    expect("intervalMs" in retry && retry.intervalMs).toBe(30_000);

    const once = project.task("onceTask");
    expect(once.mode).toBe("once");
    expect("keepBrowserOpen" in once && once.keepBrowserOpen).toBe(true);
  });

  it("generated run function works end-to-end", async () => {
    const received: Secrets[] = [];

    async function capture(_log: StepLogger, _browser: BrowserAPI, secrets: Secrets) {
      received.push(secrets);
    }

    const project = defineProject({
      name: "e2e-test",
      tasks: [
        {
          name: "captureTask",
          displayUrl: "https://example.com",
          secretsSchema: testSchema,
          mode: "once",
          steps: [capture],
        },
      ],
    });

    const browser = stubBrowserAPI();
    await project.task("captureTask").run(browser, { email: "x", password: "y" }, noopDeps);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ email: "x", password: "y" });
  });
});
