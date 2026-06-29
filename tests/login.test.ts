import { describe, expect, it } from "vitest";
import { authenticatedLoginTarget, shouldRedirectAuthenticatedLogin, ssoLoginUrl } from "@/lib/auth/login";

describe("login auth landing helpers", () => {
  it("uses AUTH_SSO_LOGIN_URL when configured", () => {
    expect(ssoLoginUrl({ AUTH_SSO_LOGIN_URL: "https://sso.example.test/login" } as unknown as NodeJS.ProcessEnv)).toBe("https://sso.example.test/login");
  });

  it("returns null when SSO URL is not configured", () => {
    expect(ssoLoginUrl({ AUTH_SSO_LOGIN_URL: "" } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("redirects authenticated roles to their landing page", () => {
    expect(shouldRedirectAuthenticatedLogin("OWNER")).toBe(true);
    expect(authenticatedLoginTarget("FINANCE")).toBe("/tempo");
    expect(authenticatedLoginTarget("VIEWER")).toBe("/no-access");
    expect(shouldRedirectAuthenticatedLogin("VIEWER")).toBe(true);
  });
});
