import { describe, it, expect, afterEach, vi } from "vitest";
import { botcLoginTask } from "../../../stack/projects/botc/tasks/botc.js";
import {
  setupTaskTest,
  createDefaultResponder,
  type TaskTestSetup,
} from "../../fixtures/test-helpers.js";
import { createTaskLogger } from "../../../stack/framework/logging.js";

const noopLogger = createTaskLogger("test", () => undefined);

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
    expect(botcLoginTask.needs).toEqual({ email: "email", password: "password" });
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

  it("navigates and fills login form on happy path", async () => {
    // Mock sleep to avoid real delays
    vi.mock("../../../stack/projects/utils/timing.js", () => ({
      sleep: () => Promise.resolve(),
    }));

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

    const result = await botcLoginTask.run(
      setup.browser,
      {
        email: "user@test.com",
        password: "pass123",
      },
      noopLogger,
    );

    expect(result.ok).toBe(true);
    expect(result.finalUrl).toContain("dashboard");

    vi.restoreAllMocks();
  });

  it("fails when email input is not found", async () => {
    vi.mock("../../../stack/projects/utils/timing.js", () => ({
      sleep: () => Promise.resolve(),
    }));

    const { responder, state } = createDefaultResponder({
      waitForSelector: () => ({ type: "waitForSelector", found: false }),
      querySelectorRect: () => ({ type: "querySelectorRect", found: false }),
    });
    setup = await setupTaskTest(responder);
    state.siteUrl = setup.siteUrl;

    await expect(
      botcLoginTask.run(setup.browser, { email: "user@test.com", password: "pass123" }, noopLogger),
    ).rejects.toThrow("EMAIL_INPUT_NOT_FOUND");

    vi.restoreAllMocks();
  });

  it("fails when still on login page after submit", async () => {
    vi.mock("../../../stack/projects/utils/timing.js", () => ({
      sleep: () => Promise.resolve(),
    }));

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

    await expect(
      botcLoginTask.run(setup.browser, { email: "user@test.com", password: "pass123" }, noopLogger),
    ).rejects.toThrow("STILL_ON_LOGIN_PAGE");

    vi.restoreAllMocks();
  });
});
