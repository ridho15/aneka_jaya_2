import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/session/role/route";

describe("demo role selection route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets the demo role cookie only when explicitly enabled for technical development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_PROVIDER", "demo");
    vi.stubEnv("AUTH_ENABLE_DEMO_ROLE_SELECTOR", "true");

    const response = await POST(new Request("http://local/api/session/role", {
      method: "POST",
      body: JSON.stringify({ role: "OWNER" })
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { role: "OWNER" } });
    expect(response.headers.get("set-cookie")).toContain("aneka_jaya_role=OWNER");
  });

  it("rejects manual role changes when trusted-header auth is active", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_PROVIDER", "trusted_header");
    vi.stubEnv("AUTH_ENABLE_DEMO_ROLE_SELECTOR", "true");

    const response = await POST(new Request("http://local/api/session/role", {
      method: "POST",
      body: JSON.stringify({ role: "OWNER" })
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      message: "Pemilihan role manual hanya tersedia untuk development teknis."
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
