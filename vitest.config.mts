import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["test/*-fork.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
    testTimeout: 300000
  },
});
