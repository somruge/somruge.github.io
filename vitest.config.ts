import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["worker/test/**/*.test.ts", "tests/unit/**/*.test.ts"],
    // base/DEV_ENVIRONMENT.md: cap workers explicitly (BASE.md §39.1).
    pool: "forks",
    maxWorkers: 2,
  },
});
