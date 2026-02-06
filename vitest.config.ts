import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["stack/**/*.test.ts"],
  },
});
