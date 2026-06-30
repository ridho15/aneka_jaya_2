import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentAnikaErpToken: vi.fn(),
  resolveAuthProvider: vi.fn()
}));

vi.mock("@/lib/auth/anikaErp", () => ({ currentAnikaErpToken: mocks.currentAnikaErpToken }));
vi.mock("@/lib/auth/request", () => ({ resolveAuthProvider: mocks.resolveAuthProvider }));

import { getErpSyncPreflight } from "@/lib/erpSync/preflight";

describe("ERP sync preflight", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ANIKA_ERP_API_BASE_URL", "https://erp.example.test/api/integrations");
    vi.stubEnv("ANIKA_ERP_API_TOKEN", "static-token");
    mocks.currentAnikaErpToken.mockReset();
    mocks.currentAnikaErpToken.mockResolvedValue(null);
    mocks.resolveAuthProvider.mockReset();
    mocks.resolveAuthProvider.mockReturnValue("local_credentials");
  });

  it("reports auto-create customer as disabled by default", async () => {
    vi.stubEnv("ANIKA_ERP_AUTO_CREATE_CUSTOMER", "false");

    await expect(getErpSyncPreflight()).resolves.toMatchObject({
      autoCreateCustomer: {
        enabled: false,
        endpointConfigured: true,
        message: expect.stringContaining("nonaktif")
      }
    });
  });

  it("reports auto-create customer as enabled", async () => {
    vi.stubEnv("ANIKA_ERP_AUTO_CREATE_CUSTOMER", "true");

    await expect(getErpSyncPreflight()).resolves.toMatchObject({
      autoCreateCustomer: {
        enabled: true,
        endpointConfigured: true,
        message: expect.stringContaining("aktif")
      }
    });
  });

  it("reports ERP auth readiness without leaking token values", async () => {
    vi.stubEnv("ANIKA_ERP_API_TOKEN", "super-secret-token");

    const result = await getErpSyncPreflight();
    expect(result.erp).toMatchObject({ baseUrlConfigured: true, staticTokenConfigured: true, authReady: true });
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
  });
});
