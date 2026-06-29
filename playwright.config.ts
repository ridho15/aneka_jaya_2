import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual",
  outputDir: "./test-results/visual",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:3010",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "env NEXT_PUBLIC_APP_MODE=development AUTH_PROVIDER=trusted_header AUTH_TRUSTED_HEADER_SECRET=visual-secret AUTH_TRUSTED_HEADER_ALLOW_ROLE_HEADER=true AUTH_SSO_LOGIN_URL= AUTH_ENABLE_DEMO_ROLE_SELECTOR=false APP_DEFAULT_ROLE=VIEWER npm run start -- -p 3010",
    url: "http://127.0.0.1:3010",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1366, height: 768 } }
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    }
  ]
});
