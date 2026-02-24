import { describe, it, expect } from "vitest";
import type { TaskConfig } from "../../../stack/framework/tasks.js";
import type { ProjectConfig } from "../../../stack/framework/project.js";
import {
  listTaskNames,
  loadTask,
  isTaskConfig,
  validateProjectModule,
  getProjectNeeds,
} from "../../../stack/framework/loader.js";

function fakeTask(overrides: {
  name: string;
  project: string;
  needs: string[] | Record<string, string>;
}): TaskConfig {
  return {
    ...overrides,
    displayUrl: "https://example.com",
    mode: "once" as const,
    run: () => Promise.resolve("done"),
  };
}

function fakeProject(name: string, tasks: TaskConfig[]): ProjectConfig {
  return {
    name,
    tasks,
    task(n: string): TaskConfig {
      const found = tasks.find((t) => t.name === n);
      if (!found) throw new Error(`No task "${n}" in project "${name}"`);
      return found;
    },
  };
}

describe("listTaskNames", () => {
  it("returns sorted task names from all projects", async () => {
    const projects = [
      fakeProject("alpha", [fakeTask({ name: "zTask", project: "alpha", needs: [] })]),
      fakeProject("beta", [
        fakeTask({ name: "aTask", project: "beta", needs: [] }),
        fakeTask({ name: "mTask", project: "beta", needs: [] }),
      ]),
    ];

    const names = await listTaskNames(async () => projects);
    expect(names).toEqual(["aTask", "mTask", "zTask"]);
  });

  it("returns empty array when no projects exist", async () => {
    const names = await listTaskNames(async () => []);
    expect(names).toEqual([]);
  });

  it("returns empty array when projects have no tasks", async () => {
    const names = await listTaskNames(async () => [fakeProject("empty", [])]);
    expect(names).toEqual([]);
  });
});

describe("loadTask", () => {
  it("returns task by name from a project", async () => {
    const task = fakeTask({ name: "myTask", project: "proj", needs: ["email"] });
    const projects = [fakeProject("proj", [task])];

    const loaded = await loadTask("myTask", async () => projects);
    expect(loaded.name).toBe("myTask");
    expect(loaded.project).toBe("proj");
  });

  it("finds task across multiple projects", async () => {
    const projects = [
      fakeProject("alpha", [fakeTask({ name: "taskA", project: "alpha", needs: [] })]),
      fakeProject("beta", [fakeTask({ name: "taskB", project: "beta", needs: [] })]),
    ];

    const loaded = await loadTask("taskB", async () => projects);
    expect(loaded.name).toBe("taskB");
  });

  it("throws when no task is found", async () => {
    const projects = [
      fakeProject("proj", [fakeTask({ name: "other", project: "proj", needs: [] })]),
    ];

    await expect(loadTask("nonexistent", async () => projects)).rejects.toThrow(
      'No task found for "nonexistent"',
    );
  });

  it("throws when task name is ambiguous (found in multiple projects)", async () => {
    const projects = [
      fakeProject("projA", [fakeTask({ name: "shared", project: "projA", needs: [] })]),
      fakeProject("projB", [fakeTask({ name: "shared", project: "projB", needs: [] })]),
    ];

    await expect(loadTask("shared", async () => projects)).rejects.toThrow(
      'Ambiguous task "shared"',
    );
  });

  it("error message includes available task names", async () => {
    const projects = [
      fakeProject("proj", [
        fakeTask({ name: "alpha", project: "proj", needs: [] }),
        fakeTask({ name: "beta", project: "proj", needs: [] }),
      ]),
    ];

    await expect(loadTask("missing", async () => projects)).rejects.toThrow(
      "Available tasks: alpha, beta",
    );
  });
});

describe("isTaskConfig", () => {
  it("returns true for a valid once-mode task", () => {
    expect(
      isTaskConfig({
        name: "test",
        displayUrl: "https://example.com",
        project: "proj",
        needs: ["email"],
        mode: "once",
        run: () => Promise.resolve("done"),
      }),
    ).toBe(true);
  });

  it("returns true for a task with secretsSchema", async () => {
    const { z } = await import("zod");
    expect(
      isTaskConfig({
        name: "test",
        displayUrl: "https://example.com",
        project: "proj",
        needs: ["email"],
        mode: "once",
        secretsSchema: z.object({ email: z.string() }),
        run: () => Promise.resolve("done"),
      }),
    ).toBe(true);
  });

  it("returns true for a valid retry-mode task", () => {
    expect(
      isTaskConfig({
        name: "test",
        displayUrl: "https://example.com",
        project: "proj",
        needs: { loginEmail: "email" },
        mode: "retry",
        intervalMs: 5000,
        run: () => Promise.resolve("done"),
      }),
    ).toBe(true);
  });

  it("returns false for an invalid object", () => {
    expect(isTaskConfig({ name: "test" })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isTaskConfig(null)).toBe(false);
    expect(isTaskConfig("string")).toBe(false);
  });
});

describe("validateProjectModule", () => {
  it("returns project when module exports a valid ProjectConfig", () => {
    const project = fakeProject("myProj", [
      fakeTask({ name: "myTask", project: "myProj", needs: [] }),
    ]);

    const result = validateProjectModule({ project }, "mydir");
    expect(result.name).toBe("myProj");
    expect(result.tasks).toHaveLength(1);
  });

  it("throws when module does not export a valid ProjectConfig", () => {
    expect(() => validateProjectModule({ project: {} }, "bad")).toThrow(
      'must export a valid ProjectConfig as "project"',
    );
  });

  it("throws when module has no project export", () => {
    expect(() => validateProjectModule({}, "missing")).toThrow(
      'must export a valid ProjectConfig as "project"',
    );
  });

  it("throws when project has invalid tasks", () => {
    expect(() =>
      validateProjectModule({ project: { name: "test", tasks: [{ invalid: true }] } }, "bad"),
    ).toThrow('must export a valid ProjectConfig as "project"');
  });
});

describe("getProjectNeeds", () => {
  it("collects and deduplicates needs from matching project", async () => {
    const projects = [
      fakeProject("proj", [
        fakeTask({ name: "a", project: "proj", needs: ["email", "password"] }),
        fakeTask({ name: "b", project: "proj", needs: ["email", "token"] }),
      ]),
    ];

    const needs = await getProjectNeeds("proj", async () => projects);
    expect(needs).toEqual(["email", "password", "token"]);
  });

  it("ignores tasks from other projects", async () => {
    const projects = [
      fakeProject("proj", [fakeTask({ name: "a", project: "proj", needs: ["email"] })]),
      fakeProject("other", [fakeTask({ name: "b", project: "other", needs: ["token"] })]),
    ];

    const needs = await getProjectNeeds("proj", async () => projects);
    expect(needs).toEqual(["email"]);
  });

  it("returns empty array when no project matches", async () => {
    const projects = [
      fakeProject("other", [fakeTask({ name: "a", project: "other", needs: ["email"] })]),
    ];

    const needs = await getProjectNeeds("proj", async () => projects);
    expect(needs).toEqual([]);
  });

  it("normalizes object-form needs", async () => {
    const projects = [
      fakeProject("proj", [
        fakeTask({
          name: "a",
          project: "proj",
          needs: { loginEmail: "email", pw: "password" },
        }),
      ]),
    ];

    const needs = await getProjectNeeds("proj", async () => projects);
    expect(needs).toEqual(["email", "password"]);
  });
});
