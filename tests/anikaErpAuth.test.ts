import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  setLocalSessionCookie: vi.fn(),
  user: null as null | {
    id: string;
    externalId: string;
    email: string;
    name: string;
    role: "OWNER";
    isActive: boolean;
  },
  prisma: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    auditLog: { create: vi.fn(async () => ({})) }
  }
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: mocks.cookieSet, get: vi.fn() }))
}));
vi.mock("@/lib/auth/localSession", () => ({ setLocalSessionCookie: mocks.setLocalSessionCookie }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { loginWithAnikaErp } from "@/lib/auth/anikaErp";

describe("Anika ERP authentication", () => {
  beforeEach(() => {
    vi.stubEnv("ANIKA_ERP_API_BASE_URL", "https://erp.example.test/api/integrations");
    mocks.cookieSet.mockReset();
    mocks.setLocalSessionCookie.mockReset();
    mocks.prisma.user.findFirst.mockReset();
    mocks.prisma.user.create.mockReset();
    mocks.prisma.user.update.mockReset();
    mocks.prisma.auditLog.create.mockClear();
    mocks.prisma.user.findFirst.mockResolvedValue(null);
    mocks.prisma.user.create.mockImplementation(async ({ data }) => data);
    vi.restoreAllMocks();
  });

  it("maps Super Admin to Owner, syncs the user, and stores the token in an HttpOnly cookie", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      token: "erp-token",
      token_type: "Bearer",
      issued_by: { id: 1, name: "ERP Owner", email: "owner@example.test", roles: ["Super Admin"] },
      expires_in_minutes: 720
    }), { status: 200 }));

    await expect(loginWithAnikaErp({ identifier: "owner@example.test", password: "secret" })).resolves.toMatchObject({
      user: { id: "anika:1", name: "ERP Owner", role: "OWNER" },
      redirectTo: "/dashboard"
    });

    expect(mocks.prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ externalId: "anika:1", email: "owner@example.test", role: "OWNER" })
    });
    expect(mocks.prisma.user.create.mock.calls[0]?.[0]?.data).not.toHaveProperty("passwordHash");
    expect(mocks.setLocalSessionCookie).toHaveBeenCalledWith("anika:1");
    expect(mocks.cookieSet).toHaveBeenCalledWith("aneka_jaya_erp_token", "erp-token", expect.objectContaining({
      httpOnly: true,
      maxAge: 43_200
    }));
  });

  it("returns a generic message for rejected ERP credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "backend detail" }), { status: 401 }));

    await expect(loginWithAnikaErp({ identifier: "owner@example.test", password: "wrong" }))
      .rejects.toThrow("Email atau password ERP tidak valid.");
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
