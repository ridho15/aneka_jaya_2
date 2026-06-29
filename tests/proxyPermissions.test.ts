import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function makeRequest(path: string, headers?: HeadersInit) {
  return new NextRequest(`http://local${path}`, { headers });
}

describe("proxy permission enforcement", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects roles that do not have the page permission", () => {
    vi.stubEnv("AUTH_PROVIDER", "demo");
    vi.stubEnv("APP_DEFAULT_ROLE", "VIEWER");

    const response = proxy(makeRequest("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://local/no-access");
  });

  it("allows trusted-header requests with a valid authenticated user id", () => {
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");
    vi.stubEnv("AUTH_TRUSTED_HEADER_SECRET", "secret");

    const response = proxy(makeRequest("/tempo", {
      "x-aneka-auth-secret": "secret",
      "x-aneka-user-id": "u-1",
      "x-aneka-user-role": "FINANCE"
    }));

    expect(response.headers.get("location")).toBeNull();
  });

  it("does not use trusted-header role for page-level permission decisions", () => {
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");
    vi.stubEnv("AUTH_TRUSTED_HEADER_SECRET", "secret");

    const financeDashboard = proxy(makeRequest("/dashboard", {
      "x-aneka-auth-secret": "secret",
      "x-aneka-user-id": "u-finance",
      "x-aneka-user-role": "FINANCE"
    }));
    const adminSettings = proxy(makeRequest("/settings", {
      "x-aneka-auth-secret": "secret",
      "x-aneka-user-id": "u-admin",
      "x-aneka-user-role": "ADMIN"
    }));

    expect(financeDashboard.headers.get("location")).toBeNull();
    expect(adminSettings.headers.get("location")).toBeNull();
  });

  it("allows manager trusted-header access to approval pages", () => {
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");
    vi.stubEnv("AUTH_TRUSTED_HEADER_SECRET", "secret");

    const response = proxy(makeRequest("/approval", {
      "x-aneka-auth-secret": "secret",
      "x-aneka-user-id": "u-manager",
      "x-aneka-user-role": "MANAGER"
    }));

    expect(response.headers.get("location")).toBeNull();
  });

  it("ignores demo cookies when trusted-header auth is active", () => {
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");
    vi.stubEnv("AUTH_TRUSTED_HEADER_SECRET", "secret");

    const response = proxy(makeRequest("/dashboard", {
      cookie: "aneka_jaya_role=OWNER"
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://local/login");
  });

  it("rejects trusted-header requests when the shared secret is invalid", () => {
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");
    vi.stubEnv("AUTH_TRUSTED_HEADER_SECRET", "secret");

    const response = proxy(makeRequest("/approval", {
      "x-aneka-auth-secret": "wrong",
      "x-aneka-user-id": "u-manager",
      "x-aneka-user-role": "MANAGER"
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://local/login");
  });

  it("does not protect the login page", () => {
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");
    vi.stubEnv("AUTH_TRUSTED_HEADER_SECRET", "secret");

    const response = proxy(makeRequest("/login"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("does not protect the auth landing page", () => {
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");
    vi.stubEnv("AUTH_TRUSTED_HEADER_SECRET", "secret");

    const response = proxy(makeRequest("/"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects trusted-header requests without identity to login", () => {
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");
    vi.stubEnv("AUTH_TRUSTED_HEADER_SECRET", "secret");

    const response = proxy(makeRequest("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://local/login");
  });
});
