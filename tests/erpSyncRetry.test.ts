import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  prisma: {
    salesRecord: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    }
  },
  sendNeoCommand: vi.fn(),
  recordAudit: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/api/neo", () => ({ sendNeoCommand: mocks.sendNeoCommand }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));

import { getErpSyncOverview, retryPendingSalesErpSync, retrySalesErpSync } from "@/lib/erpSync/salesRetry";

const row = {
  id: "S-ERP-1",
  saleDate: new Date("2026-06-29"),
  tipeId: "AJ",
  tipeCodeSnapshot: "AJ",
  tipeNameSnapshot: "Aneka Jaya",
  customerName: "Budi",
  customerLocation: "Toko",
  shippingMethod: "Kurir",
  paymentMethod: "Cash",
  dueDate: null,
  rekeningId: "cash-aj",
  transferAccount: null,
  notes: null,
  total: 10000,
  syncTarget: "erp",
  syncStatus: "failed",
  syncError: "ERP timeout saat sinkronisasi.",
  syncAttemptedAt: new Date("2026-06-29T10:00:00.000Z"),
  syncedAt: null,
  erpReference: null,
  testReference: null,
  isTestTransaction: false,
  createdAt: new Date("2026-06-29T09:00:00.000Z"),
  items: [{ productRef: "P-1", quantity: 1, unitPrice: 10000, discount: 0, sortOrder: 0 }]
};

describe("ERP sync retry service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists ERP pending/failed rows with summary counts", async () => {
    mocks.prisma.salesRecord.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    mocks.prisma.salesRecord.findMany.mockResolvedValue([row]);

    await expect(getErpSyncOverview()).resolves.toMatchObject({
      summary: { pending: 1, failed: 2, synced: 3, totalErp: 6 },
      items: [{ id: "S-ERP-1", syncStatus: "failed", retryable: true }]
    });
  });

  it("marks a failed sales sync as synced when retry succeeds", async () => {
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(row);
    mocks.sendNeoCommand.mockResolvedValue({ success: true, data: { invoice_id: "INV-1" } });
    mocks.prisma.salesRecord.update.mockResolvedValueOnce({ ...row, syncStatus: "pending" }).mockResolvedValueOnce({ ...row, syncStatus: "synced", syncError: null, erpReference: "INV-1", syncedAt: new Date("2026-06-29T11:00:00.000Z") });

    await expect(retrySalesErpSync("S-ERP-1")).resolves.toMatchObject({ success: true, message: "Retry ERP berhasil.", item: { syncStatus: "synced", erpReference: "INV-1" } });

    expect(mocks.sendNeoCommand).toHaveBeenCalledWith(expect.objectContaining({
      parsedIntent: expect.objectContaining({ action: "create_sales", tipe_code_snapshot: "AJ" })
    }));
    expect(mocks.prisma.salesRecord.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ syncStatus: "synced", syncError: null, erpReference: "INV-1" })
    }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "erp_sync", action: "retry_sync" }));
  });

  it("keeps a failed status with a safe error when retry fails", async () => {
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(row);
    mocks.sendNeoCommand.mockResolvedValue({ success: false, code: "ERP_AUTH", message: "raw upstream detail" });
    mocks.prisma.salesRecord.update.mockResolvedValueOnce({ ...row, syncStatus: "pending" }).mockResolvedValueOnce({ ...row, syncStatus: "failed", syncError: "ERP menolak akses. Silakan cek sesi atau token ERP." });

    await expect(retrySalesErpSync("S-ERP-1")).resolves.toMatchObject({
      success: false,
      message: "ERP menolak akses. Silakan cek sesi atau token ERP.",
      item: { syncStatus: "failed" }
    });
    expect(JSON.stringify(mocks.prisma.salesRecord.update.mock.calls)).not.toContain("raw upstream detail");
  });

  it("retries batch pending/failed sales rows", async () => {
    mocks.prisma.salesRecord.findMany.mockResolvedValue([{ id: "S-ERP-1" }]);
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(row);
    mocks.sendNeoCommand.mockResolvedValue({ success: true, data: { id: "ERP-1" } });
    mocks.prisma.salesRecord.update.mockResolvedValueOnce({ ...row, syncStatus: "pending" }).mockResolvedValueOnce({ ...row, syncStatus: "synced", erpReference: "ERP-1", syncError: null, syncedAt: new Date() });

    await expect(retryPendingSalesErpSync()).resolves.toMatchObject({ attempted: 1, succeeded: 1, failed: 0 });
  });
});
