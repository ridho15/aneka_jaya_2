import { describe, expect, it } from "vitest";
import { isDemoRoleSelectorEnabled, shouldShowDemoLogout } from "@/lib/auth/demoUi";

describe("demo auth UI", () => {
  it("shows demo controls only for explicit technical development auth", () => {
    expect(isDemoRoleSelectorEnabled({ AUTH_PROVIDER: "demo", AUTH_ENABLE_DEMO_ROLE_SELECTOR: "true", NODE_ENV: "development" })).toBe(true);
    expect(shouldShowDemoLogout({ AUTH_PROVIDER: "demo", AUTH_ENABLE_DEMO_ROLE_SELECTOR: "true", NODE_ENV: "development" })).toBe(true);
    expect(shouldShowDemoLogout({ AUTH_PROVIDER: "demo", NODE_ENV: "development" })).toBe(false);
    expect(shouldShowDemoLogout({ AUTH_PROVIDER: "trusted_header", NODE_ENV: "development" })).toBe(false);
    expect(shouldShowDemoLogout({ AUTH_PROVIDER: "demo", AUTH_ENABLE_DEMO_ROLE_SELECTOR: "true", NODE_ENV: "production" })).toBe(false);
  });
});
