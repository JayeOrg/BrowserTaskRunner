import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { PROJECTS_DIR, LOGS_DIR } from "../../../stack/framework/paths.js";

describe("PROJECTS_DIR", () => {
  it("resolves relative to framework, not hardcoded to stack/projects", () => {
    // PROJECTS_DIR must be a sibling of framework/ so it works in Docker
    // where the compiled output is dist/framework/ → dist/projects/,
    // not stack/framework/ → stack/projects/.
    const frameworkDir = resolve(import.meta.dirname, "../../../stack/framework");
    const expected = resolve(dirname(frameworkDir), "projects");
    expect(PROJECTS_DIR).toBe(expected);
  });

  it("points to a directory that exists on disk", () => {
    expect(existsSync(PROJECTS_DIR)).toBe(true);
  });
});

describe("LOGS_DIR", () => {
  it("resolves to logs/ at project root", () => {
    expect(LOGS_DIR).toMatch(/\/logs$/u);
  });
});
