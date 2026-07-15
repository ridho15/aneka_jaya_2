import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  prisma: {
    salesRecord: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    }
  },
  user: { id: "owner-1", name: "Owner", role: "OWNER" },
  cancelErpSales: vi.fn(),
  recordAudit: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => mocks.user) }));
vi.mock("@/lib/api/salesCancellations", () => ({ cancelErpSales: mocks.cancelErpSales }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));

import { cancelSalesRecord, getSalesRecord, listSalesRecords, listSalesRecordsPage, saveSalesRecord } from "@/lib/sales/store";

const dbSale = {
  id: "S-1",
  saleDate: new Date("2026-06-27"),
  tipeId: "W",
  tipeCodeSnapshot: "W",
  tipeNameSnapshot: "Walk In",
  customerName: "Budi",
  customerLocation: "Toko",
  shippingMethod: "di Tempat",
  paymentMethod: "Tempo",
  dueDate: new Date("2026-07-27"),
  rekeningId: "cash-w",
  transferAccount: null,
  notes: null,
  total: 20000,
  approvalStatus: "approved",
  createdByUserId: "owner-1",
  createdByNameSnapshot: "Owner",
  createdByRoleSnapshot: "OWNER",
  createdAt: new Date("2026-06-27T00:00:00.000Z"),
  items: [
    { id: "I-1", salesRecordId: "S-1", productRef: "P-1", quantity: 2, unitPrice: 10000, discount: 0, sortOrder: 0 }
  ]
};

describe("sales store normalized persistence", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "production");
    mocks.prisma.salesRecord.findMany.mockReset();
    mocks.prisma.salesRecord.count.mockReset();
    mocks.prisma.salesRecord.findUnique.mockReset();
    mocks.prisma.salesRecord.create.mockReset();
    mocks.prisma.salesRecord.update.mockReset();
    mocks.cancelErpSales.mockReset();
    mocks.recordAudit.mockReset();
    mocks.user = { id: "owner-1", name: "Owner", role: "OWNER" };
  });

  it("maps normalized sales item rows back to the public Sale.items array", async () => {
    mocks.prisma.salesRecord.findMany.mockResolvedValue([dbSale]);

    await expect(listSalesRecords()).resolves.toEqual([
      expect.objectContaining({
        id: "S-1",
        items: [expect.objectContaining({ productRef: "P-1", quantity: 2, unitPrice: 10000, discount: 0 })]
      })
    ]);
    expect(mocks.prisma.salesRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: { items: { orderBy: { sortOrder: "asc" } } }
    }));
  });

  it("keeps getSalesRecord compatible with print and reporting callers", async () => {
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(dbSale);

    await expect(getSalesRecord("S-1")).resolves.toMatchObject({
      id: "S-1",
      items: [{ productRef: "P-1", quantity: 2, unitPrice: 10000, discount: 0 }]
    });
  });

  it("writes sales items through nested normalized rows", async () => {
    mocks.prisma.salesRecord.create.mockResolvedValue(dbSale);

    await saveSalesRecord({
      id: "S-2",
      saleDate: "2026-06-28",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      customerName: "Ani",
      customerLocation: "Toko",
      shippingMethod: "di Tempat",
      paymentMethod: "Cash",
      total: 5000,
      approvalStatus: "approved",
      createdByUserId: "owner-1",
      createdByNameSnapshot: "Owner",
      createdByRoleSnapshot: "OWNER",
      items: [{ productRef: "P-2", quantity: 1, unitPrice: 5000, discount: 0 }]
    });

    expect(mocks.prisma.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        items: { create: [expect.objectContaining({ productRef: "P-2", sortOrder: 0 })] }
      })
    }));
  });

  it("filters paginated sales by rekening together with payment and approval status", async () => {
    mocks.prisma.salesRecord.count.mockResolvedValue(1);
    mocks.prisma.salesRecord.findMany.mockResolvedValue([{ ...dbSale, paymentMethod: "TF", rekeningId: "bca" }]);

    await expect(listSalesRecordsPage({
      page: 1,
      pageSize: 10,
      filters: { rekening: "bca", paymentMethod: "TF", approvalStatus: "approved" }
    })).resolves.toMatchObject({ meta: { total: 1 }, data: [expect.objectContaining({ rekeningId: "bca" })] });

    const expectedWhere = expect.objectContaining({
      paymentMethod: "TF",
      approvalStatus: "approved",
      AND: [expect.objectContaining({ OR: [{ rekeningId: "bca" }, { transferAccount: "bca" }] })]
    });
    expect(mocks.prisma.salesRecord.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(mocks.prisma.salesRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
  });

  it("cancels synced ERP sales through Aneka Jaya before updating local status", async () => {
    const syncedSale = {
      ...dbSale,
      syncTarget: "erp",
      syncStatus: "synced",
      syncError: null,
      erpReference: "SLM-INV-1",
      stockReleaseReference: "SLM-STOCK-1",
      erpPaymentReference: "SLM-PAY-1",
      stockReleaseStatus: "released",
      erpPaymentStatus: "paid"
    };
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(syncedSale);
    mocks.cancelErpSales.mockResolvedValue({
      success: true,
      data: {
        status: "cancelled",
        reversalReference: "ERP-CANCEL-1",
        raw: {}
      }
    });
    mocks.prisma.salesRecord.update.mockResolvedValue({
      ...syncedSale,
      approvalStatus: "cancelled",
      syncError: "Transaksi dibatalkan dan sudah dibatalkan di ERP."
    });

    await expect(cancelSalesRecord("S-1", "Customer batal")).resolves.toMatchObject({
      approvalStatus: "cancelled",
      syncStatus: "synced"
    });

    expect(mocks.cancelErpSales).toHaveBeenCalledWith(expect.objectContaining({
      erpReference: "SLM-CANCEL-S-1",
      sourceNumber: "SLM-INV-1",
      saleReference: "S-1",
      stockReleaseReference: "SLM-STOCK-1",
      paymentReference: "SLM-PAY-1",
      reason: "Customer batal",
      requestedBy: { id: "owner-1", name: "Owner", role: "OWNER" }
    }));
    expect(mocks.prisma.salesRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        approvalStatus: "cancelled",
        syncStatus: "synced",
        syncError: "Transaksi dibatalkan dan sudah dibatalkan di ERP."
      })
    }));
  });

  it("does not cancel locally when ERP cancellation fails", async () => {
    mocks.prisma.salesRecord.findUnique.mockResolvedValue({
      ...dbSale,
      syncTarget: "erp",
      syncStatus: "synced",
      erpReference: "SLM-INV-1"
    });
    mocks.cancelErpSales.mockResolvedValue({ success: false, message: "Invoice ERP tidak bisa dibatalkan." });

    await expect(cancelSalesRecord("S-1", "Customer batal")).rejects.toThrow("Invoice ERP tidak bisa dibatalkan.");

    expect(mocks.prisma.salesRecord.update).not.toHaveBeenCalled();
  });
});
