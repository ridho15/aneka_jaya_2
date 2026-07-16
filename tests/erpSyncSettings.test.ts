import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  role: "OWNER",
  getCurrentUser: vi.fn(),
  recordAudit: vi.fn(),
  prisma: {
    appSetting: {
      findUnique: vi.fn(),
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

import { GET, PUT } from "@/app/api/settings/erp-sync/route";
import { ERP_SYNC_AFTER_SALES_EDIT_KEY, getErpSyncSetting, updateErpSyncSetting } from "@/lib/settings/erpSync";

describe("ERP Sync setting", () => {
  beforeEach(() => {
    mocks.role = "OWNER";
    mocks.getCurrentUser.mockResolvedValue({ id: "owner-1", name: "Owner", role: "OWNER" });
    mocks.recordAudit.mockReset();
    mocks.prisma.appSetting.findUnique.mockReset();
    mocks.prisma.appSetting.upsert.mockReset();
  });

  it("defaults auto sync after sales edit to off", async () => {
    mocks.prisma.appSetting.findUnique.mockResolvedValue(null);

    await expect(getErpSyncSetting()).resolves.toEqual({ autoSyncAfterSalesEdit: false });
  });

  it("reads enabled auto sync setting", async () => {
    mocks.prisma.appSetting.findUnique.mockResolvedValue({ key: ERP_SYNC_AFTER_SALES_EDIT_KEY, value: "true" });

    await expect(getErpSyncSetting()).resolves.toEqual({ autoSyncAfterSalesEdit: true });
  });

  it("updates auto sync setting and records audit", async () => {
    mocks.prisma.appSetting.findUnique.mockResolvedValue({ key: ERP_SYNC_AFTER_SALES_EDIT_KEY, value: "false" });
    mocks.prisma.appSetting.upsert.mockResolvedValue({});

    await expect(updateErpSyncSetting({ autoSyncAfterSalesEdit: true })).resolves.toEqual({ autoSyncAfterSalesEdit: true });

    expect(mocks.prisma.appSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: ERP_SYNC_AFTER_SALES_EDIT_KEY },
      update: expect.objectContaining({ value: "true", updatedByUserId: "owner-1", updatedByNameSnapshot: "Owner" })
    }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "app_setting",
      entityId: ERP_SYNC_AFTER_SALES_EDIT_KEY,
      action: "update",
      beforeValue: { autoSyncAfterSalesEdit: false },
      afterValue: { autoSyncAfterSalesEdit: true }
    }));
  });

  it("enforces OWNER-only ERP Sync setting permission", async () => {
    mocks.role = "ADMIN";

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
  });

  it("updates through API", async () => {
    mocks.prisma.appSetting.findUnique.mockResolvedValue(null);
    mocks.prisma.appSetting.upsert.mockResolvedValue({});

    const response = await PUT(new Request("http://local/api/settings/erp-sync", {
      method: "PUT",
      body: JSON.stringify({ autoSyncAfterSalesEdit: true })
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { autoSyncAfterSalesEdit: true } });
  });
});
