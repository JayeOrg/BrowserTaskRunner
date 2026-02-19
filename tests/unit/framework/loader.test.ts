import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, type Dirent } from "node:fs";
import type { TaskConfig } from "../../../stack/framework/tasks.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readdirSync: vi.fn() };
});

function makeDirent(name: string, isDir: boolean): Dirent {
  return { name, isDirectory: () => isDir } as Dirent;
}

// loader.ts uses import.meta.dirname to find the projects dir.
// In vitest, that resolves to stack/framework/, so projectsDir() = stack/projects/.
// We mock readdirSync to simulate project/task directory layouts.

beforeEach(() => {
  vi.mocked(readdirSync).mockReset();
});

async function getLoader() {
  return import("../../../stack/framework/loader.js");
}

describe("listTaskNames", () => {
  it("returns sorted task names from project task directories", async () => {
    vi.mocked(readdirSync).mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === "object" && "withFileTypes" in options) {
        return [makeDirent("alpha", true), makeDirent("beta", true)];
      }
      if (path.includes("alpha")) return ["zTask.js", "aTask.js"];
      if (path.includes("beta")) return ["mTask.js"];
      return [];
    }) as typeof readdirSync);

    const { listTaskNames } = await getLoader();
    const names = listTaskNames();
    expect(names).toEqual(["aTask", "mTask", "zTask"]);
  });

  it("ignores non-.js files", async () => {
    vi.mocked(readdirSync).mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === "object" && "withFileTypes" in options) {
        return [makeDirent("proj", true)];
      }
      return ["task.js", "task.ts", "task.d.ts", "README.md"];
    }) as typeof readdirSync);

    const { listTaskNames } = await getLoader();
    const names = listTaskNames();
    expect(names).toEqual(["task"]);
  });

  it("handles project with no tasks directory (ENOENT)", async () => {
    vi.mocked(readdirSync).mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === "object" && "withFileTypes" in options) {
        return [makeDirent("empty-proj", true)];
      }
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }) as typeof readdirSync);

    const { listTaskNames } = await getLoader();
    const names = listTaskNames();
    expect(names).toEqual([]);
  });

  it("propagates non-ENOENT filesystem errors", async () => {
    vi.mocked(readdirSync).mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === "object" && "withFileTypes" in options) {
        return [makeDirent("proj", true)];
      }
      const err = new Error("EACCES") as NodeJS.ErrnoException;
      err.code = "EACCES";
      throw err;
    }) as typeof readdirSync);

    const { listTaskNames } = await getLoader();
    expect(() => listTaskNames()).toThrow("EACCES");
  });

  it("skips non-directory entries in projects dir", async () => {
    vi.mocked(readdirSync).mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === "object" && "withFileTypes" in options) {
        return [makeDirent("README.md", false), makeDirent("proj", true)];
      }
      return ["myTask.js"];
    }) as typeof readdirSync);

    const { listTaskNames } = await getLoader();
    const names = listTaskNames();
    expect(names).toEqual(["myTask"]);
  });
});

describe("loadTask", () => {
  it("throws when no task file is found", async () => {
    vi.mocked(readdirSync).mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === "object" && "withFileTypes" in options) {
        return [makeDirent("proj", true)];
      }
      return ["other.js"];
    }) as typeof readdirSync);

    const { loadTask } = await getLoader();
    await expect(loadTask("nonexistent")).rejects.toThrow('No task file found for "nonexistent"');
  });

  it("throws when task name is ambiguous (found in multiple projects)", async () => {
    vi.mocked(readdirSync).mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === "object" && "withFileTypes" in options) {
        return [makeDirent("projA", true), makeDirent("projB", true)];
      }
      // Both projects have the same task file
      return ["shared.js"];
    }) as typeof readdirSync);

    const { loadTask } = await getLoader();
    await expect(loadTask("shared")).rejects.toThrow('Ambiguous task "shared"');
  });
});

describe("isTaskConfig", () => {
  it("returns true for a valid once-mode task", async () => {
    const { isTaskConfig } = await getLoader();
    expect(
      isTaskConfig({
        name: "test",
        displayUrl: "https://example.com",
        project: "proj",
        needs: ["email"],
        mode: "once",
        run: () => Promise.resolve({ lastCompletedStep: "done" }),
      }),
    ).toBe(true);
  });

  it("returns true for a task with secretsSchema", async () => {
    const { z } = await import("zod");
    const { isTaskConfig } = await getLoader();
    expect(
      isTaskConfig({
        name: "test",
        displayUrl: "https://example.com",
        project: "proj",
        needs: ["email"],
        mode: "once",
        secretsSchema: z.object({ email: z.string() }),
        run: () => Promise.resolve({ lastCompletedStep: "done" }),
      }),
    ).toBe(true);
  });

  it("returns true for a valid retry-mode task", async () => {
    const { isTaskConfig } = await getLoader();
    expect(
      isTaskConfig({
        name: "test",
        displayUrl: "https://example.com",
        project: "proj",
        needs: { loginEmail: "email" },
        mode: "retry",
        intervalMs: 5000,
        run: () => Promise.resolve({ lastCompletedStep: "done" }),
      }),
    ).toBe(true);
  });

  it("returns false for an invalid object", async () => {
    const { isTaskConfig } = await getLoader();
    expect(isTaskConfig({ name: "test" })).toBe(false);
  });

  it("returns false for non-objects", async () => {
    const { isTaskConfig } = await getLoader();
    expect(isTaskConfig(null)).toBe(false);
    expect(isTaskConfig("string")).toBe(false);
  });
});

describe("validateLoadedModule", () => {
  it("returns task when module exports a valid TaskConfig", async () => {
    const { validateLoadedModule } = await getLoader();
    const mod = {
      task: {
        name: "myTask",
        displayUrl: "https://example.com",
        project: "proj",
        needs: ["email"],
        mode: "once",
        run: () => Promise.resolve({ lastCompletedStep: "done" }),
      },
    };
    const result = validateLoadedModule(mod, "myTask", "/fake/path/myTask.js");
    expect(result.name).toBe("myTask");
  });

  it("throws when module does not export a valid TaskConfig", async () => {
    const { validateLoadedModule } = await getLoader();
    expect(() => validateLoadedModule({ task: {} }, "bad", "/fake/bad.js")).toThrow(
      'must export a valid TaskConfig as "task"',
    );
  });

  it("throws when module has no task export", async () => {
    const { validateLoadedModule } = await getLoader();
    expect(() => validateLoadedModule({}, "missing", "/fake/missing.js")).toThrow(
      'must export a valid TaskConfig as "task"',
    );
  });

  it("throws when task.name does not match expected name", async () => {
    const { validateLoadedModule } = await getLoader();
    const mod = {
      task: {
        name: "wrong",
        displayUrl: "https://example.com",
        project: "proj",
        needs: [],
        mode: "once",
        run: () => Promise.resolve({ lastCompletedStep: "done" }),
      },
    };
    expect(() => validateLoadedModule(mod, "expected", "/fake/expected.js")).toThrow(
      'task.name is "wrong" but filename requires "expected"',
    );
  });
});

describe("getProjectNeeds", () => {
  function fakeTask(overrides: {
    name: string;
    project: string;
    needs: string[] | Record<string, string>;
  }): TaskConfig {
    return {
      ...overrides,
      displayUrl: "https://example.com",
      mode: "once" as const,
      run: () => Promise.resolve({ lastCompletedStep: "done" }),
    };
  }

  it("collects and deduplicates needs from matching tasks", async () => {
    vi.mocked(readdirSync).mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === "object" && "withFileTypes" in options) {
        return [makeDirent("proj", true)];
      }
      return ["a.js", "b.js"];
    }) as typeof readdirSync);

    const loader = vi.fn<(name: string) => Promise<TaskConfig>>();
    loader.mockResolvedValueOnce(
      fakeTask({ name: "a", project: "proj", needs: ["email", "password"] }),
    );
    loader.mockResolvedValueOnce(
      fakeTask({ name: "b", project: "proj", needs: ["email", "token"] }),
    );

    const { getProjectNeeds } = await getLoader();
    const needs = await getProjectNeeds("proj", loader);
    expect(needs).toEqual(["email", "password", "token"]);
  });

  it("ignores tasks from other projects", async () => {
    vi.mocked(readdirSync).mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === "object" && "withFileTypes" in options) {
        return [makeDirent("proj", true)];
      }
      return ["a.js", "b.js"];
    }) as typeof readdirSync);

    const loader = vi.fn<(name: string) => Promise<TaskConfig>>();
    loader.mockResolvedValueOnce(fakeTask({ name: "a", project: "proj", needs: ["email"] }));
    loader.mockResolvedValueOnce(fakeTask({ name: "b", project: "other", needs: ["token"] }));

    const { getProjectNeeds } = await getLoader();
    const needs = await getProjectNeeds("proj", loader);
    expect(needs).toEqual(["email"]);
  });

  it("returns empty array when no tasks match", async () => {
    vi.mocked(readdirSync).mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === "object" && "withFileTypes" in options) {
        return [makeDirent("proj", true)];
      }
      return ["a.js"];
    }) as typeof readdirSync);

    const loader = vi.fn<(name: string) => Promise<TaskConfig>>();
    loader.mockResolvedValueOnce(fakeTask({ name: "a", project: "other", needs: ["email"] }));

    const { getProjectNeeds } = await getLoader();
    const needs = await getProjectNeeds("proj", loader);
    expect(needs).toEqual([]);
  });

  it("normalizes object-form needs", async () => {
    vi.mocked(readdirSync).mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === "object" && "withFileTypes" in options) {
        return [makeDirent("proj", true)];
      }
      return ["a.js"];
    }) as typeof readdirSync);

    const loader = vi.fn<(name: string) => Promise<TaskConfig>>();
    loader.mockResolvedValueOnce(
      fakeTask({ name: "a", project: "proj", needs: { loginEmail: "email", pw: "password" } }),
    );

    const { getProjectNeeds } = await getLoader();
    const needs = await getProjectNeeds("proj", loader);
    expect(needs).toEqual(["email", "password"]);
  });
});
