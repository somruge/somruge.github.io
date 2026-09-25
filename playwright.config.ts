import { defineConfig, devices } from "@playwright/test";

// One worker: base/DEV_ENVIRONMENT.md limits test parallelism on the dev machine (BASE.md §39.1).
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: "http://localhost:8080" },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://localhost:8080",
    reuseExistingServer: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
