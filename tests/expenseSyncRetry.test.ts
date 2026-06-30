import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  prisma: {
    expenseRecord: {
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

import { getExpenseSyncOverview, retryExpenseErpSync, retryPendingExpenseErpSync } from "@/lib/erpSync/expenseRetry";

const row = {
  id: "E-ERP-1",
  expenseDate: new Date("2026-06-29"),
  tipeId: "AJ",
  tipeCodeSnapshot: "AJ",
  tipeNameSnapshot: "Aneka Jaya",
  rekeningId: "cash-aj",
  rekeningNameSnapshot: "Kas AJ",
  coaId: "Kas",
  coaNameSnapshot: "Kas",
  category: "Operasional",
  vendorName: "Vendor",
  description: "Biaya",
  amount: 10000,
  paymentMethod: "Cash",
  attachmentUrl: null,
  notes: null,
  approvalStatus: "approved",
  erpSyncTarget: "erp",
  erpSyncStatus: "failed",
  erpSyncError: "ERP timeout saat sinkronisasi.",
  erpSyncAttemptedAt: new Date("2026-06-29T10:00:00.000Z"),
  erpSyncedAt: null,
  erpReference: null,
  createdByUserId: "owner-1",
  createdByNameSnapshot: "Owner",
  createdByRoleSnapshot: "OWNER",
  createdAt: new Date("2026-06-29T09:00:00.000Z")
};

describe("expense ERP sync retry service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists pending/failed expenses with summary counts", async () => {
    mocks.prisma.expenseRecord.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    mocks.prisma.expenseRecord.findMany.mockResolvedValue([row]);

    await expect(getExpenseSyncOverview()).resolves.toMatchObject({
      summary: { pending: 1, failed: 2, synced: 3, totalErp: 6 },
      items: [{ id: "E-ERP-1", erpSyncStatus: "failed", retryable: true }]
    });
    expect(mocks.prisma.expenseRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ approvalStatus: "approved" })
    }));
  });

  it("returns an operational warning when Prisma expense storage is not generated", async () => {
    const delegate = mocks.prisma.expenseRecord;
    // @ts-expect-error simulates stale Prisma Client runtime
    mocks.prisma.expenseRecord = undefined;

    await expect(getExpenseSyncOverview()).resolves.toMatchObject({
      storageReady: false,
      warning: "Prisma Client belum tersinkron. Jalankan generate/migrate dan restart server.",
      summary: { pending: 0, failed: 0, synced: 0, totalErp: 0 },
      items: []
    });

    mocks.prisma.expenseRecord = delegate;
  });

  it("marks a failed expense sync as synced when retry succeeds", async () => {
    mocks.prisma.expenseRecord.findUnique.mockResolvedValue(row);
    mocks.sendNeoCommand.mockResolvedValue({ success: true, data: { reference: "KB-1" } });
    mocks.prisma.expenseRecord.update.mockResolvedValueOnce({ ...row, erpSyncStatus: "pending" }).mockResolvedValueOnce({ ...row, erpSyncStatus: "synced", erpSyncError: null, erpReference: "KB-1", erpSyncedAt: new Date() });

    await expect(retryExpenseErpSync("E-ERP-1")).resolves.toMatchObject({ success: true, message: "Retry pengeluaran ERP berhasil.", item: { erpSyncStatus: "synced", erpReference: "KB-1" } });

    expect(mocks.sendNeoCommand).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("Transaksi Kas & Bank")
    }));
    expect(mocks.prisma.expenseRecord.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ erpSyncStatus: "synced", erpSyncError: null, erpReference: "KB-1" })
    }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "erp_sync", action: "retry_sync" }));
  });

  it("keeps failed status with safe error when retry fails", async () => {
    mocks.prisma.expenseRecord.findUnique.mockResolvedValue(row);
    mocks.sendNeoCommand.mockResolvedValue({ success: false, code: "ERP_AUTH", message: "raw secret" });
    mocks.prisma.expenseRecord.update.mockResolvedValueOnce({ ...row, erpSyncStatus: "pending" }).mockResolvedValueOnce({ ...row, erpSyncStatus: "failed", erpSyncError: "ERP menolak akses. Silakan cek sesi atau token ERP." });

    await expect(retryExpenseErpSync("E-ERP-1")).resolves.toMatchObject({
      success: false,
      message: "ERP menolak akses. Silakan cek sesi atau token ERP.",
      item: { erpSyncStatus: "failed" }
    });
    expect(JSON.stringify(mocks.prisma.expenseRecord.update.mock.calls)).not.toContain("raw secret");
  });

  it("stores an operational validation error and safe correlation id when ERP rejects expense payload", async () => {
    mocks.prisma.expenseRecord.findUnique.mockResolvedValue(row);
    mocks.sendNeoCommand.mockResolvedValue({ success: false, code: "ERP_VALIDATION", message: "ERP menolak payload: rekening tidak ditemukan", details: { correlationId: "cid-expense-1" } });
    mocks.prisma.expenseRecord.update.mockResolvedValueOnce({ ...row, erpSyncStatus: "pending" }).mockResolvedValueOnce({ ...row, erpSyncStatus: "failed", erpSyncError: "ERP menolak payload: rekening tidak ditemukan" });

    await expect(retryExpenseErpSync("E-ERP-1")).resolves.toMatchObject({
      success: false,
      message: "ERP menolak payload: rekening tidak ditemukan"
    });
    expect(mocks.prisma.expenseRecord.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ erpSyncStatus: "failed", erpSyncError: "ERP menolak payload: rekening tidak ditemukan" })
    }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      afterValue: expect.objectContaining({ correlationId: "cid-expense-1" })
    }));
  });

  it("does not retry expenses before approval", async () => {
    mocks.prisma.expenseRecord.findUnique.mockResolvedValue({ ...row, approvalStatus: "pending_approval", erpSyncStatus: "pending" });

    await expect(retryExpenseErpSync("E-ERP-1")).resolves.toMatchObject({
      success: false,
      message: "Pengeluaran belum approved, tidak bisa sinkron ERP."
    });
    expect(mocks.sendNeoCommand).not.toHaveBeenCalled();
  });

  it("retries batch pending/failed expense rows", async () => {
    mocks.prisma.expenseRecord.findMany.mockResolvedValue([{ id: "E-ERP-1" }]);
    mocks.prisma.expenseRecord.findUnique.mockResolvedValue(row);
    mocks.sendNeoCommand.mockResolvedValue({ success: true, data: { id: "ERP-1" } });
    mocks.prisma.expenseRecord.update.mockResolvedValueOnce({ ...row, erpSyncStatus: "pending" }).mockResolvedValueOnce({ ...row, erpSyncStatus: "synced", erpReference: "ERP-1", erpSyncError: null, erpSyncedAt: new Date() });

    await expect(retryPendingExpenseErpSync()).resolves.toMatchObject({ attempted: 1, succeeded: 1, failed: 0 });
    expect(mocks.prisma.expenseRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ approvalStatus: "approved" })
    }));
  });
});
