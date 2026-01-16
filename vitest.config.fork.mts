import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/*-fork.test.ts"],
    // Run tests sequentially to avoid anvil port/resource contention
    pool: "forks",
    maxWorkers: 1,
    // Disable file parallelism
    fileParallelism: false,
    // Fork tests need longer timeout for network setup
    testTimeout: 120000,
    coverage: {
      provider: "v8",
      reporter: ["json", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "test/**",
        "dist/**",
        "*.config.*",
        "src/cli/cli.ts",
        "src/cli/tui/**",
      ],
      // Output to separate directory for merging
      reportsDirectory: "coverage-fork",
    },
  },
});
