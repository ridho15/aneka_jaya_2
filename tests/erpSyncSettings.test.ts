import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  role: "OWNER",
  getCurrentUser: vi.fn(),
  recordAudit: vi.fn(),
  prisma: {
    appSetting: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(async (tasks: unknown[]) => tasks),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn(async () => mocks.role),
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { GET, PUT } from "@/app/api/settings/erp-sync/route";
import {
  ERP_SYNC_AFTER_SALES_EDIT_KEY,
  ERP_TRANSACTION_SYNC_ENABLED_KEY,
  MJ_TRANSACTION_MODE_KEY,
  getErpSyncSetting,
  updateErpSyncSetting,
} from "@/lib/settings/erpSync";

describe("ERP Sync setting", () => {
  beforeEach(() => {
    mocks.role = "OWNER";
    mocks.getCurrentUser.mockResolvedValue({ id: "owner-1", name: "Owner", role: "OWNER" });
    mocks.recordAudit.mockReset();
    mocks.prisma.appSetting.findUnique.mockReset();
    mocks.prisma.appSetting.findMany.mockReset();
    mocks.prisma.appSetting.upsert.mockReset();
    mocks.prisma.$transaction.mockImplementation(async (tasks: unknown[]) => tasks);
  });

  it("defaults auto sync after sales edit to off and full sync enabled", async () => {
    mocks.prisma.appSetting.findMany.mockResolvedValue([]);

    const result = await getErpSyncSetting();
    expect(result.autoSyncAfterSalesEdit).toBe(false);
    expect(result.erpTransactionSyncEnabled).toBe(true);
    expect(["disabled", "record_only", "process_aj"]).toContain(result.mjTransactionMode);
  });

  it("reads enabled auto sync setting and transaction settings", async () => {
    mocks.prisma.appSetting.findMany.mockResolvedValue([
      { key: ERP_SYNC_AFTER_SALES_EDIT_KEY, value: "true" },
      { key: ERP_TRANSACTION_SYNC_ENABLED_KEY, value: "false" },
      { key: MJ_TRANSACTION_MODE_KEY, value: "record_only" },
    ]);

    const result = await getErpSyncSetting();
    expect(result).toEqual({
      autoSyncAfterSalesEdit: true,
      erpTransactionSyncEnabled: false,
      mjTransactionMode: "record_only",
    });
  });

  it("updates auto sync setting and records audit", async () => {
    mocks.prisma.appSetting.findMany.mockResolvedValue([
      { key: ERP_SYNC_AFTER_SALES_EDIT_KEY, value: "false" },
      { key: ERP_TRANSACTION_SYNC_ENABLED_KEY, value: "true" },
      { key: MJ_TRANSACTION_MODE_KEY, value: "process_aj" },
    ]);
    mocks.prisma.appSetting.upsert.mockResolvedValue({});

    const result = await updateErpSyncSetting({
      autoSyncAfterSalesEdit: true,
      erpTransactionSyncEnabled: false,
      mjTransactionMode: "disabled",
    });

    expect(result).toEqual({
      autoSyncAfterSalesEdit: true,
      erpTransactionSyncEnabled: false,
      mjTransactionMode: "disabled",
    });

    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "app_setting",
        entityId: ERP_SYNC_AFTER_SALES_EDIT_KEY,
        action: "update",
        afterValue: expect.objectContaining({
          autoSyncAfterSalesEdit: true,
          erpTransactionSyncEnabled: false,
          mjTransactionMode: "disabled",
        }),
      })
    );
  });

  it("enforces OWNER-only ERP Sync setting permission", async () => {
    mocks.role = "ADMIN";

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
  });

  it("updates through API", async () => {
    mocks.prisma.appSetting.findMany.mockResolvedValue([]);
    mocks.prisma.appSetting.upsert.mockResolvedValue({});

    const response = await PUT(
      new Request("http://local/api/settings/erp-sync", {
        method: "PUT",
        body: JSON.stringify({
          autoSyncAfterSalesEdit: true,
          erpTransactionSyncEnabled: false,
          mjTransactionMode: "disabled",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        autoSyncAfterSalesEdit: true,
        erpTransactionSyncEnabled: false,
        mjTransactionMode: "disabled",
      },
    });
  });
});
