import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/session/logout/route";

describe("demo session logout route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("clears the demo role cookie outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_PROVIDER", "demo");
    vi.stubEnv("AUTH_ENABLE_DEMO_ROLE_SELECTOR", "true");

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("aneka_jaya_role=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Path=/");
  });

  it("rejects demo logout in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_PROVIDER", "demo");
    vi.stubEnv("AUTH_ENABLE_DEMO_ROLE_SELECTOR", "true");

    const response = await POST();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      message: "Logout demo hanya tersedia untuk development teknis."
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects demo logout when operational trusted-header auth is active", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");

    const response = await POST();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      message: "Logout demo hanya tersedia untuk development teknis."
    });
  });
});
