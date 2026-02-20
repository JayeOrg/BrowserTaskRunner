import { describe, it, expect, afterEach, vi } from "vitest";
import { task as botcLoginTask } from "../../../stack/projects/botc/tasks/botcLogin.js";
import {
  setupTaskRunTest,
  teardownTaskTest,
  noopLogger,
  type TaskTestSetup,
} from "../../fixtures/test-helpers.js";
vi.mock("../../../stack/projects/utils/timing.js", () => ({
  sleep: () => Promise.resolve(),
}));

// vi.mock factory is hoisted above imports, so we inline the mock here.
// Implementation lives in tests/fixtures/poll-mock.ts for non-hoisted contexts.
vi.mock("../../../stack/projects/utils/poll.js", async () => ({
  pollUntil: (await import("../../fixtures/poll-mock.js")).fastPollUntil,
}));

let setup: TaskTestSetup | null = null;

afterEach(() => {
  teardownTaskTest(setup);
  setup = null;
});

describe("e2e: botcLoginTask", () => {
  it("has correct task metadata", () => {
    expect(botcLoginTask.name).toBe("botcLogin");
    expect(botcLoginTask.mode).toBe("retry");
    expect(botcLoginTask.project).toBe("monitor-botc");
    expect(botcLoginTask.secretsSchema).toBeDefined();
  });

  it("validates secrets schema requires email and password", () => {
    const schema = botcLoginTask.secretsSchema;
    expect(schema).toBeDefined();

    const valid = schema?.safeParse({ email: "user@test.com", password: "pass123" });
    expect(valid?.success).toBe(true);

    const missingEmail = schema?.safeParse({ password: "pass123" });
    expect(missingEmail?.success).toBe(false);

    const missingPassword = schema?.safeParse({ email: "user@test.com" });
    expect(missingPassword?.success).toBe(false);
  });

  it("navigates and fills login form on happy path", async () => {
    const ctx = await setupTaskRunTest({
      waitForSelector: (cmd) => ({
        type: "waitForSelector",
        found: true,
        selector: String(cmd.selector),
      }),
      fill: () => ({ type: "fill", success: true }),
      click: () => ({ type: "click", success: true }),
      querySelectorRect: () => ({ type: "querySelectorRect", found: false }),
      getUrl: () => ({
        type: "getUrl",
        url: "https://botc.app/dashboard",
        title: "Dashboard",
      }),
    });
    setup = ctx;

    const deps = { ...ctx.browser.stepRunnerDeps(), taskLogger: noopLogger };
    const result = await botcLoginTask.run(
      ctx.browser,
      {
        email: "user@test.com",
        password: "pass123",
      },
      deps,
    );

    expect(result).toBe("checkResult");
  });

  it("fails when email input is not found", async () => {
    const ctx = await setupTaskRunTest({
      waitForSelector: () => ({ type: "waitForSelector", found: false }),
      querySelectorRect: () => ({ type: "querySelectorRect", found: false }),
    });
    setup = ctx;

    const deps = { ...ctx.browser.stepRunnerDeps(), taskLogger: noopLogger };
    await expect(
      botcLoginTask.run(ctx.browser, { email: "user@test.com", password: "pass123" }, deps),
    ).rejects.toThrow("EMAIL_INPUT_NOT_FOUND");
  });

  it("fails when still on login page after submit", async () => {
    const ctx = await setupTaskRunTest({
      waitForSelector: (cmd) => ({
        type: "waitForSelector",
        found: true,
        selector: String(cmd.selector),
      }),
      fill: () => ({ type: "fill", success: true }),
      click: () => ({ type: "click", success: true }),
      querySelectorRect: () => ({ type: "querySelectorRect", found: false }),
      getUrl: () => ({
        type: "getUrl",
        url: "https://botc.app/login",
        title: "Login",
      }),
    });
    setup = ctx;

    const deps = { ...ctx.browser.stepRunnerDeps(), taskLogger: noopLogger };
    await expect(
      botcLoginTask.run(ctx.browser, { email: "user@test.com", password: "pass123" }, deps),
    ).rejects.toThrow("STILL_ON_LOGIN_PAGE");
  });
});
