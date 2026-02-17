import { describe, it, expect } from "vitest";
import { tailLines } from "../../../stack/infra/run-utils.js";

describe("tailLines", () => {
  it("returns the last N lines", () => {
    const content = "line1\nline2\nline3\nline4\nline5";
    expect(tailLines(content, 3)).toBe("line3\nline4\nline5");
  });

  it("returns all lines when count exceeds total", () => {
    const content = "a\nb";
    expect(tailLines(content, 10)).toBe("a\nb");
  });

  it("returns the whole string for count = 1 with no newlines", () => {
    expect(tailLines("only line", 1)).toBe("only line");
  });

  it("handles empty string", () => {
    expect(tailLines("", 5)).toBe("");
  });

  it("handles trailing newline", () => {
    const content = "line1\nline2\n";
    // Split produces ["line1", "line2", ""], last 2 = ["line2", ""]
    expect(tailLines(content, 2)).toBe("line2\n");
  });
});
