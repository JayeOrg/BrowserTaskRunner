import { describe, it, expect, afterEach, vi } from "vitest";
import { task as botcLoginTask } from "../../../stack/projects/botc/tasks/botcLogin.js";
import {
  setupTaskTest,
  createDefaultResponder,
  noopLogger,
  type TaskTestSetup,
} from "../../fixtures/test-helpers.js";

vi.mock("../../../stack/projects/utils/timing.js", () => ({
  sleep: () => Promise.resolve(),
}));

let setup: TaskTestSetup | null = null;

afterEach(() => {
  setup?.browser.close();
  setup?.ext.close();
  setup?.site.server.close();
  setup = null;
});

describe("e2e: botcLoginTask", () => {
  it("has correct task metadata", () => {
    expect(botcLoginTask.name).toBe("botcLogin");
    expect(botcLoginTask.mode).toBe("retry");
    expect(botcLoginTask.project).toBe("monitor-botc");
    expect(botcLoginTask.contextSchema).toBeDefined();
  });

  it("validates context schema requires email and password", () => {
    const schema = botcLoginTask.contextSchema;
    expect(schema).toBeDefined();

    const valid = schema?.safeParse({ email: "user@test.com", password: "pass123" });
    expect(valid?.success).toBe(true);

    const missingEmail = schema?.safeParse({ password: "pass123" });
    expect(missingEmail?.success).toBe(false);

    const missingPassword = schema?.safeParse({ email: "user@test.com" });
    expect(missingPassword?.success).toBe(false);
  });

  // CheckAlreadyLoggedIn polls getText for 5s before proceeding with login
  it("navigates and fills login form on happy path", { timeout: 10_000 }, async () => {
    const { responder, state } = createDefaultResponder({
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
    setup = await setupTaskTest(responder);
    state.siteUrl = setup.siteUrl;

    const deps = { ...setup.browser.stepRunnerDeps(), taskLogger: noopLogger };
    const result = await botcLoginTask.run(
      setup.browser,
      {
        email: "user@test.com",
        password: "pass123",
      },
      deps,
    );

    expect(result.finalUrl).toContain("dashboard");
  });

  it("fails when email input is not found", { timeout: 10_000 }, async () => {
    const { responder, state } = createDefaultResponder({
      waitForSelector: () => ({ type: "waitForSelector", found: false }),
      querySelectorRect: () => ({ type: "querySelectorRect", found: false }),
    });
    setup = await setupTaskTest(responder);
    state.siteUrl = setup.siteUrl;

    const deps = { ...setup.browser.stepRunnerDeps(), taskLogger: noopLogger };
    await expect(
      botcLoginTask.run(setup.browser, { email: "user@test.com", password: "pass123" }, deps),
    ).rejects.toThrow("EMAIL_INPUT_NOT_FOUND");
  });

  // CheckAlreadyLoggedIn (5s) + checkResult (15s) polling against real Date.now()
  it("fails when still on login page after submit", { timeout: 25_000 }, async () => {
    const { responder, state } = createDefaultResponder({
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
    setup = await setupTaskTest(responder);
    state.siteUrl = setup.siteUrl;

    const deps = { ...setup.browser.stepRunnerDeps(), taskLogger: noopLogger };
    await expect(
      botcLoginTask.run(setup.browser, { email: "user@test.com", password: "pass123" }, deps),
    ).rejects.toThrow("STILL_ON_LOGIN_PAGE");
  });
});
