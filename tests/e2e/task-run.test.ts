import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { StepError } from "../../stack/framework/errors.js";
import { clickTask } from "./fixtures/click-task.js";
import { retryTask, resetAttempts } from "./fixtures/retry-task.js";
import {
  setupRawTaskTest,
  setupTaskRunTest,
  createDefaultResponder,
  teardownTaskTest,
  noopDeps,
  type TaskTestSetup,
} from "../fixtures/test-helpers.js";

let setup: TaskTestSetup | null = null;

afterEach(() => {
  teardownTaskTest(setup);
  setup = null;
});

describe("e2e: click-task against local test site", () => {
  it("navigates, clicks button, and verifies /success", async () => {
    const ctx = await setupTaskRunTest();
    setup = ctx;
    const result = await clickTask.run(ctx.browser, { url: ctx.siteUrl }, noopDeps);

    expect(result).toBe("verify");
    expect(ctx.state.commands).toEqual(["navigate", "waitForSelector", "click", "getUrl"]);
  });

  it("fails when button is not found on page", async () => {
    const ctx = await setupTaskRunTest({
      waitForSelector: () => ({ type: "waitForSelector", found: false }),
    });
    setup = ctx;

    await expect(clickTask.run(ctx.browser, { url: ctx.siteUrl }, noopDeps)).rejects.toThrow(
      "BUTTON_NOT_FOUND",
    );
  });

  it("fails when click does not navigate away", async () => {
    const ctx = await setupTaskRunTest({
      click: () => ({ type: "click", success: true }),
      getUrl: (_cmd, current) => ({ type: "getUrl", url: current.currentUrl, title: "Test Page" }),
    });
    setup = ctx;

    await expect(clickTask.run(ctx.browser, { url: ctx.siteUrl }, noopDeps)).rejects.toThrow(
      "NOT_ON_SUCCESS_PAGE",
    );
  });

  it("propagates extension errors to the task", async () => {
    const ctx = await setupTaskRunTest({
      navigate: () => ({ type: "navigate", url: "", title: "", error: "Tab crashed" }),
    });
    setup = ctx;

    await expect(clickTask.run(ctx.browser, { url: ctx.siteUrl }, noopDeps)).rejects.toThrow(
      "Tab crashed",
    );
  });

  it("fails when click returns failure", async () => {
    const ctx = await setupTaskRunTest({
      click: () => ({ type: "click", success: false }),
    });
    setup = ctx;

    await expect(clickTask.run(ctx.browser, { url: ctx.siteUrl }, noopDeps)).rejects.toThrow(
      "CLICK_FAILED",
    );
  });

  it("StepError includes finalUrl metadata on verify failure", async () => {
    const ctx = await setupTaskRunTest({
      click: () => ({ type: "click", success: true }),
      getUrl: (_cmd, current) => ({
        type: "getUrl",
        url: `${current.currentUrl}/wrong-page`,
        title: "Wrong",
      }),
    });
    setup = ctx;

    try {
      await clickTask.run(ctx.browser, { url: ctx.siteUrl }, noopDeps);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(StepError);
      const stepError = error instanceof StepError ? error : null;
      expect(stepError?.meta.finalUrl).toContain("/wrong-page");
    }
  });
});

describe("e2e: retry-task behavior", () => {
  beforeEach(() => {
    resetAttempts();
  });

  it("fails on first attempts, succeeds on later attempt", async () => {
    const { responder } = createDefaultResponder();
    setup = await setupRawTaskTest(responder);

    // First call: should fail (attempt 1 <= failUntil 2)
    await expect(retryTask.run(setup.browser, { failUntil: "2" }, noopDeps)).rejects.toThrow(
      "NOT_READY_YET",
    );

    // Second call: should also fail (attempt 2 <= failUntil 2)
    await expect(retryTask.run(setup.browser, { failUntil: "2" }, noopDeps)).rejects.toThrow(
      "NOT_READY_YET",
    );

    // Third call: should succeed (attempt 3 > failUntil 2)
    await retryTask.run(setup.browser, { failUntil: "2" }, noopDeps);
  });

  it("is a RetryingTask with mode 'retry'", () => {
    expect(retryTask.mode).toBe("retry");
    expect(retryTask.intervalMs).toBe(10);
  });

  it("StepError from retry-task includes summary metadata", async () => {
    const { responder } = createDefaultResponder();
    setup = await setupRawTaskTest(responder);

    try {
      await retryTask.run(setup.browser, { failUntil: "1" }, noopDeps);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(StepError);
      const stepError = error instanceof StepError ? error : null;
      expect(stepError?.meta.summary).toContain("Attempt 1 of 1");
    }
  });
});
