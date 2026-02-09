import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/setup/build-cli.ts"],
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
        // Orchestrator — process.exit, env vars, Docker. Tested indirectly via sub-modules.
        "stack/framework/run.ts",
        // CLI entry point — tested via child process in vault-manage.test.ts.
        // v8 coverage can't instrument code in spawned processes.
        "stack/vault/vault-manage.ts",
        // CLI modules — tested via child process in vault-manage.test.ts.
        // v8 coverage can't instrument code in spawned processes.
        "stack/vault/cli/**",
        // Static task list, no logic to test.
        "stack/framework/registry.ts",
        // Trivial setTimeout wrapper. Testing adds noise, not confidence.
        "stack/projects/utils/timing.ts",
        // Display-only: logs connection instructions, checks process.env.
        "stack/browser/instructions.ts",
      ],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
