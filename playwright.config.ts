import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

function envValue(key: string, fallback: string) {
  if (process.env[key]) return process.env[key] as string;
  if (!existsSync(".env.local")) return fallback;
  const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim() || fallback;
}

const visualSessionSecret = envValue("AUTH_SESSION_SECRET", "visual-secret");

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
    command: `npm run build && env NEXT_PUBLIC_APP_MODE=development AUTH_PROVIDER=local_credentials AUTH_SESSION_SECRET=${visualSessionSecret} AUTH_LOCAL_CREDENTIALS_ALLOW_VISUAL_FALLBACK=true AUTH_ENABLE_DEMO_ROLE_SELECTOR=false APP_DEFAULT_ROLE=VIEWER npm run start -- -p 3010`,
    url: "http://127.0.0.1:3010",
    reuseExistingServer: false,
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
