import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    exclude: ["test/*-fork.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "test/**",
        "dist/**",
        "*.config.*",
        "src/cli/cli.ts", // CLI entrypoint - not library code
        "src/cli/lib/cli.ts", // CLI implementation - I/O heavy, tested via integration
      ],
    },
    // 2 minute timeout covers 99% of tests
    // retryables.test.ts may need longer (overridden below)
    testTimeout: 120000,
  },
});
