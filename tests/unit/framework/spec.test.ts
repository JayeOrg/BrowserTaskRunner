import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { defineTask } from "../../../stack/framework/spec.js";
import type { StepLogger } from "../../../stack/framework/logging.js";
import type { BrowserAPI } from "../../../stack/browser/browser.js";
import { stubBrowserAPI } from "../../fixtures/mock-browser.js";
import { noopDeps } from "../../fixtures/test-helpers.js";

const testSchema = z.object({
  email: z.string(),
  password: z.string(),
});

type Secrets = z.infer<typeof testSchema>;

describe("defineTask", () => {
  describe("steps array mode", () => {
    it("produces a TaskConfig with correct fields", () => {
      async function step1(_log: StepLogger, _browser: BrowserAPI, _secrets: Secrets) {}

      const task = defineTask({
        name: "testTask",
        displayUrl: "https://example.com",
        project: "test-project",
        secretsSchema: testSchema,
        mode: "retry",
        intervalMs: 5000,
        steps: [step1],
      });

      expect(task.name).toBe("testTask");
      expect(task.displayUrl).toBe("https://example.com");
      expect(task.project).toBe("test-project");
      expect(task.mode).toBe("retry");
      expect(task.run).toBeTypeOf("function");
    });

    it("derives needs from secretsSchema", () => {
      async function step1(_log: StepLogger, _browser: BrowserAPI, _secrets: Secrets) {}

      const task = defineTask({
        name: "testTask",
        displayUrl: "https://example.com",
        project: "test-project",
        secretsSchema: testSchema,
        mode: "retry",
        intervalMs: 5000,
        steps: [step1],
      });

      expect(task.needs).toEqual({ email: "email", password: "password" });
    });

    it("passes parsed secrets to each handler", async () => {
      const received: Secrets[] = [];

      async function capture(_log: StepLogger, _browser: BrowserAPI, secrets: Secrets) {
        received.push(secrets);
      }

      const task = defineTask({
        name: "testTask",
        displayUrl: "https://example.com",
        project: "test-project",
        secretsSchema: testSchema,
        mode: "once",
        steps: [capture],
      });

      const browser = stubBrowserAPI();
      await task.run(browser, { email: "a@b.com", password: "secret" }, noopDeps);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ email: "a@b.com", password: "secret" });
    });

    it("registers steps in order and returns last step name", async () => {
      async function navigate(_log: StepLogger, _browser: BrowserAPI, _secrets: Secrets) {}
      async function verify(_log: StepLogger, _browser: BrowserAPI, _secrets: Secrets) {}

      const task = defineTask({
        name: "testTask",
        displayUrl: "https://example.com",
        project: "test-project",
        secretsSchema: testSchema,
        mode: "once",
        steps: [navigate, verify],
      });

      const browser = stubBrowserAPI();
      const result = await task.run(browser, { email: "a@b.com", password: "s" }, noopDeps);
      expect(result).toBe("verify");
    });

    it("calls handlers with browser and parsed secrets", async () => {
      const calls: Array<{ browser: BrowserAPI; secrets: Secrets }> = [];

      async function step1(_log: StepLogger, browser: BrowserAPI, secrets: Secrets) {
        calls.push({ browser, secrets });
      }

      const task = defineTask({
        name: "testTask",
        displayUrl: "https://example.com",
        project: "test-project",
        secretsSchema: testSchema,
        mode: "once",
        steps: [step1],
      });

      const browser = stubBrowserAPI();
      await task.run(browser, { email: "x", password: "y" }, noopDeps);

      expect(calls).toHaveLength(1);
      expect(calls[0]!.browser).toBe(browser);
      expect(calls[0]!.secrets).toEqual({ email: "x", password: "y" });
    });
  });

  describe("custom run mode", () => {
    it("passes through the provided run function", async () => {
      const customRun = vi.fn().mockResolvedValue("done");

      const task = defineTask({
        name: "customTask",
        displayUrl: "https://example.com",
        project: "test-project",
        secretsSchema: testSchema,
        mode: "once",
        run: customRun,
      });

      const browser = stubBrowserAPI();
      await task.run(browser, { email: "a", password: "b" }, noopDeps);

      expect(customRun).toHaveBeenCalledWith(browser, { email: "a", password: "b" }, noopDeps);
    });

    it("derives needs even with custom run", () => {
      const task = defineTask({
        name: "customTask",
        displayUrl: "https://example.com",
        project: "test-project",
        secretsSchema: testSchema,
        mode: "retry",
        intervalMs: 1000,
        run: async () => "done",
      });

      expect(task.needs).toEqual({ email: "email", password: "password" });
    });
  });

  describe("mode variants", () => {
    async function noop(_log: StepLogger, _browser: BrowserAPI, _secrets: Secrets) {}

    it("produces retry mode with intervalMs", () => {
      const task = defineTask({
        name: "retryTask",
        displayUrl: "https://example.com",
        project: "test",
        secretsSchema: testSchema,
        mode: "retry",
        intervalMs: 30_000,
        steps: [noop],
      });

      expect(task.mode).toBe("retry");
      expect("intervalMs" in task && task.intervalMs).toBe(30_000);
    });

    it("produces once mode with keepBrowserOpen", () => {
      const task = defineTask({
        name: "onceTask",
        displayUrl: "https://example.com",
        project: "test",
        secretsSchema: testSchema,
        mode: "once",
        keepBrowserOpen: true,
        steps: [noop],
      });

      expect(task.mode).toBe("once");
      expect("keepBrowserOpen" in task && task.keepBrowserOpen).toBe(true);
    });

    it("produces once mode without keepBrowserOpen by default", () => {
      const task = defineTask({
        name: "onceTask",
        displayUrl: "https://example.com",
        project: "test",
        secretsSchema: testSchema,
        mode: "once",
        steps: [noop],
      });

      expect(task.mode).toBe("once");
    });
  });
});
