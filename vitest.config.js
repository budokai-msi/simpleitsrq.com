// Vitest configuration.
//
// Scope: pure-function unit tests for api/_lib/ helpers. No snapshot tests,
// no DB/network hits — those are mocked via vi.mock.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["api/_lib/__tests__/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["api/_lib/**/*.js"],
      exclude: [
        "api/_lib/__tests__/**",
        "api/cron/**",
      ],
      // Thresholds are intentionally low — this is the first pass. Raise them
      // as coverage grows.
      thresholds: {
        lines: 20,
        functions: 20,
        branches: 20,
        statements: 20,
      },
    },
  },
});
