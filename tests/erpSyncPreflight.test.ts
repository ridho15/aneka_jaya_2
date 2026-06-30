import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentAnikaErpToken: vi.fn(),
  resolveAuthProvider: vi.fn(),
  listErpPaginated: vi.fn()
}));

vi.mock("@/lib/auth/anikaErp", () => ({ currentAnikaErpToken: mocks.currentAnikaErpToken }));
vi.mock("@/lib/auth/request", () => ({ resolveAuthProvider: mocks.resolveAuthProvider }));
vi.mock("@/lib/api/pagination", () => ({ listErpPaginated: mocks.listErpPaginated }));

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
    mocks.listErpPaginated.mockReset();
  });

  it("reports an unconfigured fallback customer without querying ERP", async () => {
    vi.stubEnv("ANIKA_ERP_FALLBACK_CUSTOMER_CODE", "");

    await expect(getErpSyncPreflight()).resolves.toMatchObject({
      fallbackCustomer: { configured: false, found: false, status: "missing" }
    });
    expect(mocks.listErpPaginated).not.toHaveBeenCalled();
  });

  it("reports fallback customer as found when ERP returns the configured code", async () => {
    vi.stubEnv("ANIKA_ERP_FALLBACK_CUSTOMER_CODE", "WALK-IN");
    mocks.listErpPaginated.mockResolvedValue({ success: true, data: [{ id: 99, code: "WALK-IN", name: "Customer Umum" }] });

    await expect(getErpSyncPreflight()).resolves.toMatchObject({
      fallbackCustomer: { configured: true, code: "WALK-IN", found: true, status: "configured" }
    });
    expect(mocks.listErpPaginated).toHaveBeenCalledWith("/customers", expect.objectContaining({ query: { code: "WALK-IN" } }));
  });

  it("reports fallback customer as missing when ERP does not return it", async () => {
    vi.stubEnv("ANIKA_ERP_FALLBACK_CUSTOMER_CODE", "WALK-IN");
    mocks.listErpPaginated.mockResolvedValue({ success: true, data: [] });

    await expect(getErpSyncPreflight()).resolves.toMatchObject({
      fallbackCustomer: { configured: true, code: "WALK-IN", found: false, status: "missing" }
    });
  });

  it("does not leak token values in the preflight response", async () => {
    vi.stubEnv("ANIKA_ERP_FALLBACK_CUSTOMER_CODE", "WALK-IN");
    vi.stubEnv("ANIKA_ERP_API_TOKEN", "super-secret-token");
    mocks.listErpPaginated.mockResolvedValue({ success: true, data: [{ id: 99, code: "WALK-IN" }] });

    const result = await getErpSyncPreflight();
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
  });
});
