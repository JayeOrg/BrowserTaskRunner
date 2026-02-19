import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Build-cli setup moved to vault-manage.test.ts beforeAll — only vault CLI tests need it.
    coverage: {
      provider: "v8",
      // Coverage scope: modules testable in Node.
      // NOT in scope (and why):
      //   stack/extension/**  — Chrome service worker APIs (chrome.tabs, chrome.scripting).
      //                         Can't run in Node. Typed message protocol provides compile-time safety.
      //   stack/projects/*/    — Site-specific task logic. Utilities they depend on are tested instead.
      //   stack/infra/**      — Docker/Xvfb config. Declarative, nothing to unit test.
      include: [
        "stack/framework/**/*.ts",
        "stack/vault/**/*.ts",
        "stack/projects/utils/**/*.ts",
        "stack/browser/**/*.ts",
      ],
      exclude: [
        "tests/**",
        // Orchestrator — process.exit, env vars, signal handlers. Tested indirectly via sub-modules.
        "stack/framework/run.ts",
        // CLI modules — tested via child process in vault-manage.test.ts.
        // v8 coverage can't instrument code in spawned processes.
        "stack/vault/cli/**",
        // Trivial re-export: `export const sleep = setTimeout;`
        "stack/projects/utils/timing.ts",
      ],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
