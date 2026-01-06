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
  },
});
