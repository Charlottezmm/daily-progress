import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "src/tests/e2e",
  webServer: {
    command: "APP_SECRET=test-secret PAWPLAN_ADMIN_WORKSPACE_IDS=owner-workspace npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } }
  ],
});
