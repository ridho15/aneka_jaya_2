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

  it("authenticates via verify-user endpoint, passes app=slm, and syncs user session", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      message: "Autentikasi berhasil.",
      user: {
        id: 1,
        name: "ERP Owner",
        email: "owner@example.test",
        username: "erp_owner",
        roles: ["Super Admin"],
        allowed_apps: ["slm", "mj"]
      },
      token: "erp-token",
      expires_in_minutes: 720
    }), { status: 200 }));

    await expect(loginWithAnikaErp({ identifier: "owner@example.test", password: "secret" })).resolves.toMatchObject({
      user: { id: "anika:1", name: "ERP Owner", role: "OWNER" },
      redirectTo: "/dashboard"
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://erp.example.test/api/integrations/auth/verify-user",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ identifier: "owner@example.test", password: "secret", app: "slm" })
      })
    );

    expect(mocks.prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ externalId: "anika:1", email: "owner@example.test", role: "OWNER" })
    });
    expect(mocks.setLocalSessionCookie).toHaveBeenCalledWith("anika:1");
    expect(mocks.cookieSet).toHaveBeenCalledWith("aneka_jaya_erp_token", "erp-token", expect.objectContaining({
      httpOnly: true,
      maxAge: 43_200
    }));
  });

  it("rejects login with 403 message when user does not have permission for SLM app", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: false,
      message: "Akun Anda tidak memiliki izin untuk mengakses aplikasi SLM.",
      allowed_apps: ["mj"]
    }), { status: 403 }));

    await expect(loginWithAnikaErp({ identifier: "kasir@example.test", password: "secret" }))
      .rejects.toThrow("Akun Anda tidak memiliki izin untuk mengakses aplikasi SLM.");

    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("returns a specific message for rejected ERP credentials (422)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: false,
      message: "Username/email atau password salah."
    }), { status: 422 }));

    await expect(loginWithAnikaErp({ identifier: "owner@example.test", password: "wrong" }))
      .rejects.toThrow("Username/email atau password salah.");
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("authenticates supervisor role from ERP, maps to SUPERVISOR, and redirects to /dashboard", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      message: "Autentikasi berhasil.",
      user: {
        id: 21,
        name: "Supervisor Operasional",
        email: "supervisor@example.test",
        username: "supervisor_user",
        roles: ["Supervisor"],
        allowed_apps: ["slm"]
      },
      token: "supervisor-token",
      expires_in_minutes: 720
    }), { status: 200 }));

    await expect(loginWithAnikaErp({ identifier: "supervisor@example.test", password: "secret" })).resolves.toMatchObject({
      user: { id: "anika:21", name: "Supervisor Operasional", role: "SUPERVISOR" },
      redirectTo: "/dashboard"
    });

    expect(mocks.prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ externalId: "anika:21", email: "supervisor@example.test", role: "SUPERVISOR" })
    });
  });

  it("authenticates delivery driver role from ERP and redirects to /delivery-orders", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      message: "Autentikasi berhasil.",
      user: {
        id: 31,
        name: "Driver Budi",
        email: "driver@example.test",
        username: "driver_budi",
        roles: ["Delivery Driver"],
        allowed_apps: ["slm"]
      },
      token: "driver-token",
      expires_in_minutes: 720
    }), { status: 200 }));

    await expect(loginWithAnikaErp({ identifier: "driver@example.test", password: "secret" })).resolves.toMatchObject({
      user: { id: "anika:31", name: "Driver Budi", role: "DELIVERY_DRIVER" },
      redirectTo: "/delivery-orders"
    });
  });

  it("maps Warehouse Staff role or Driver posisi fallback to DELIVERY_DRIVER", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      message: "Autentikasi berhasil.",
      user: {
        id: 32,
        name: "Staff Gudang Joko",
        email: "joko@example.test",
        username: "joko_gudang",
        roles: ["Warehouse Staff"],
        posisi: "Petugas DO",
        allowed_apps: ["slm"]
      },
      token: "joko-token",
      expires_in_minutes: 720
    }), { status: 200 }));

    await expect(loginWithAnikaErp({ identifier: "joko@example.test", password: "secret" })).resolves.toMatchObject({
      user: { id: "anika:32", name: "Staff Gudang Joko", role: "DELIVERY_DRIVER" },
      redirectTo: "/delivery-orders"
    });
  });

  it("falls back to posisi when ERP roles array is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      message: "Autentikasi berhasil.",
      user: {
        id: 33,
        name: "Kurir Santoso",
        email: "santoso@example.test",
        username: "santoso",
        roles: [],
        posisi: "Driver Delivery",
        allowed_apps: ["slm"]
      },
      token: "santoso-token",
      expires_in_minutes: 720
    }), { status: 200 }));

    await expect(loginWithAnikaErp({ identifier: "santoso@example.test", password: "secret" })).resolves.toMatchObject({
      user: { id: "anika:33", name: "Kurir Santoso", role: "DELIVERY_DRIVER" },
      redirectTo: "/delivery-orders"
    });
  });

  it("returns a friendly error message when Aneka Jaya ERP server is offline or unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(loginWithAnikaErp({ identifier: "admin@example.test", password: "secret" }))
      .rejects.toThrow("Server Aneka Jaya sedang tidak aktif atau tidak dapat dihubungi. Pastikan server ERP berjalan.");
  });

  it("returns a friendly timeout error message when connection to Aneka Jaya times out", async () => {
    const timeoutError = new Error("The operation was aborted due to timeout");
    timeoutError.name = "TimeoutError";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(timeoutError);

    await expect(loginWithAnikaErp({ identifier: "admin@example.test", password: "secret" }))
      .rejects.toThrow("Koneksi ke server Aneka Jaya melebihi batas waktu (timeout). Silakan coba beberapa saat lagi.");
  });
});
