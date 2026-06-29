import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provider: "anika_erp",
  clearLocalSessionCookie: vi.fn(),
  clearAnikaErpTokenCookie: vi.fn()
}));

vi.mock("@/lib/auth/request", () => ({ resolveAuthProvider: () => mocks.provider }));
vi.mock("@/lib/auth/localSession", () => ({ clearLocalSessionCookie: mocks.clearLocalSessionCookie }));
vi.mock("@/lib/auth/anikaErp", () => ({ clearAnikaErpTokenCookie: mocks.clearAnikaErpTokenCookie }));

import { POST } from "@/app/api/auth/logout/route";

describe("operational logout", () => {
  beforeEach(() => {
    mocks.provider = "anika_erp";
    mocks.clearLocalSessionCookie.mockReset();
    mocks.clearAnikaErpTokenCookie.mockReset();
  });

  it("clears local and ERP cookies for Anika authentication", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.clearLocalSessionCookie).toHaveBeenCalledOnce();
    expect(mocks.clearAnikaErpTokenCookie).toHaveBeenCalledOnce();
  });

  it("clears only the local cookie for local credentials", async () => {
    mocks.provider = "local_credentials";

    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.clearLocalSessionCookie).toHaveBeenCalledOnce();
    expect(mocks.clearAnikaErpTokenCookie).not.toHaveBeenCalled();
  });
});
