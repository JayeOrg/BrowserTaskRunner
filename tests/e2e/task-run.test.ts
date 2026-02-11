import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { StepError } from "../../stack/framework/errors.js";
import { clickTask } from "./fixtures/click-task.js";
import { retryTask, resetAttempts } from "./fixtures/retry-task.js";
import {
  setupTaskTest,
  createDefaultResponder,
  noopLogger,
  type TaskTestSetup,
} from "../fixtures/test-helpers.js";

let setup: TaskTestSetup | null = null;

afterEach(() => {
  setup?.browser.close();
  setup?.ext.close();
  setup?.site.server.close();
  setup = null;
});

describe("e2e: click-task against local test site", () => {
  it("navigates, clicks button, and verifies /success", async () => {
    const { responder, state } = createDefaultResponder();
    setup = await setupTaskTest(responder);
    state.siteUrl = setup.siteUrl;
    state.commands.length = 0; // Clear setup ping

    const result = await clickTask.run(setup.browser, { url: setup.siteUrl }, noopLogger);

    expect(result.finalUrl).toContain("/success");
    expect(state.commands).toEqual(["navigate", "waitForSelector", "click", "getUrl"]);
  });

  it("fails when button is not found on page", async () => {
    const { responder, state } = createDefaultResponder({
      waitForSelector: () => ({ type: "waitForSelector", found: false }),
    });
    setup = await setupTaskTest(responder);
    state.siteUrl = setup.siteUrl;

    await expect(clickTask.run(setup.browser, { url: setup.siteUrl }, noopLogger)).rejects.toThrow(
      "BUTTON_NOT_FOUND",
    );
  });

  it("fails when click does not navigate away", async () => {
    const { responder, state } = createDefaultResponder({
      click: () => ({ type: "click", success: true }),
      getUrl: (_cmd, st) => ({ type: "getUrl", url: st.currentUrl, title: "Test Page" }),
    });
    setup = await setupTaskTest(responder);
    state.siteUrl = setup.siteUrl;

    await expect(clickTask.run(setup.browser, { url: setup.siteUrl }, noopLogger)).rejects.toThrow(
      "NOT_ON_SUCCESS_PAGE",
    );
  });

  it("propagates extension errors to the task", async () => {
    const { responder, state } = createDefaultResponder({
      navigate: () => ({ type: "navigate", url: "", title: "", error: "Tab crashed" }),
    });
    setup = await setupTaskTest(responder);
    state.siteUrl = setup.siteUrl;

    await expect(clickTask.run(setup.browser, { url: setup.siteUrl }, noopLogger)).rejects.toThrow(
      "Tab crashed",
    );
  });

  it("fails when click returns failure", async () => {
    const { responder, state } = createDefaultResponder({
      click: () => ({ type: "click", success: false }),
    });
    setup = await setupTaskTest(responder);
    state.siteUrl = setup.siteUrl;

    await expect(clickTask.run(setup.browser, { url: setup.siteUrl }, noopLogger)).rejects.toThrow(
      "CLICK_FAILED",
    );
  });

  it("StepError includes finalUrl metadata on verify failure", async () => {
    const { responder, state } = createDefaultResponder({
      click: () => ({ type: "click", success: true }),
      getUrl: (_cmd, st) => ({
        type: "getUrl",
        url: `${st.currentUrl}/wrong-page`,
        title: "Wrong",
      }),
    });
    setup = await setupTaskTest(responder);
    state.siteUrl = setup.siteUrl;

    try {
      await clickTask.run(setup.browser, { url: setup.siteUrl }, noopLogger);
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
    setup = await setupTaskTest(responder);

    // First call: should fail (attempt 1 <= failUntil 2)
    await expect(retryTask.run(setup.browser, { failUntil: "2" }, noopLogger)).rejects.toThrow(
      "NOT_READY_YET",
    );

    // Second call: should also fail (attempt 2 <= failUntil 2)
    await expect(retryTask.run(setup.browser, { failUntil: "2" }, noopLogger)).rejects.toThrow(
      "NOT_READY_YET",
    );

    // Third call: should succeed (attempt 3 > failUntil 2)
    await retryTask.run(setup.browser, { failUntil: "2" }, noopLogger);
  });

  it("is a RetryingTask with mode 'retry'", () => {
    expect(retryTask.mode).toBe("retry");
    expect(retryTask.intervalMs).toBe(10);
  });

  it("StepError from retry-task includes details metadata", async () => {
    const { responder } = createDefaultResponder();
    setup = await setupTaskTest(responder);

    try {
      await retryTask.run(setup.browser, { failUntil: "1" }, noopLogger);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(StepError);
      const stepError = error instanceof StepError ? error : null;
      expect(stepError?.meta.details).toContain("Attempt 1 of 1");
    }
  });
});
