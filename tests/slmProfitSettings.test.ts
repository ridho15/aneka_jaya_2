import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  role: "OWNER",
  getCurrentUser: vi.fn(),
  recordAudit: vi.fn(),
  prisma: {
    appSetting: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn()
    }
  }
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn(async () => mocks.role),
  getCurrentUser: mocks.getCurrentUser
}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { GET, PUT } from "@/app/api/settings/profit-slm/route";
import { getOperationalProfitSetting, updateOperationalProfitSetting } from "@/lib/settings/profit";

describe("operational profit setting", () => {
  beforeEach(() => {
    mocks.role = "OWNER";
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", name: "Owner", role: "OWNER" });
    mocks.recordAudit.mockReset();
    mocks.prisma.appSetting.findUnique.mockReset();
    mocks.prisma.appSetting.findFirst.mockReset();
    mocks.prisma.appSetting.upsert.mockReset();
  });

  it("reads default zero when the setting does not exist", async () => {
    mocks.prisma.appSetting.findFirst.mockResolvedValue(null);

    await expect(getOperationalProfitSetting()).resolves.toEqual({ grossProfitPercent: 0 });
  });

  it("reads the legacy SLM percentage when the operational setting does not exist yet", async () => {
    mocks.prisma.appSetting.findFirst.mockResolvedValue({ key: "slm_gross_profit_percent", value: "10" });

    await expect(getOperationalProfitSetting()).resolves.toEqual({ grossProfitPercent: 10 });
  });

  it("updates a custom percentage and records audit", async () => {
    mocks.prisma.appSetting.findFirst.mockResolvedValue({ key: "slm_gross_profit_percent", value: "10" });
    mocks.prisma.appSetting.upsert.mockResolvedValue({});

    await expect(updateOperationalProfitSetting(22.5)).resolves.toEqual({ grossProfitPercent: 22.5 });

    expect(mocks.prisma.appSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: "operational_gross_profit_percent" },
      update: expect.objectContaining({ value: "22.5", updatedByUserId: "user-1", updatedByNameSnapshot: "Owner" })
    }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "app_setting",
      entityId: "operational_gross_profit_percent",
      action: "update",
      beforeValue: { grossProfitPercent: 10 },
      afterValue: { grossProfitPercent: 22.5 }
    }));
  });

  it("rejects invalid API percentages", async () => {
    const response = await PUT(new Request("http://local/api/settings/profit-slm", {
      method: "PUT",
      body: JSON.stringify({ grossProfitPercent: 101 })
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("returns a clear migration message when AppSetting table is missing", async () => {
    mocks.prisma.appSetting.findFirst.mockResolvedValue(null);
    mocks.prisma.appSetting.upsert.mockRejectedValue(Object.assign(new Error("The table `public.AppSetting` does not exist in the current database."), { code: "P2021" }));

    const response = await PUT(new Request("http://local/api/settings/profit-slm", {
      method: "PUT",
      body: JSON.stringify({ grossProfitPercent: 20 })
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      message: "Database belum dimigrasi. Jalankan npx prisma migrate deploy lalu restart aplikasi."
    });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("enforces profit setting permission", async () => {
    mocks.role = "ADMIN";

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
  });
});
