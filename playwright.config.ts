import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: {
    command:
      "RATE_LIMIT_PER_MINUTE=100 DAILY_REQUEST_CAP=1000 npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
