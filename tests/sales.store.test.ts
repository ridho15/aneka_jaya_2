import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sale } from "@/lib/types/sales";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    salesRecordItem: { deleteMany: vi.fn() },
    salesRecord: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    tempoReceivable: { findUnique: vi.fn(), update: vi.fn() },
    tempoPaymentReversal: { upsert: vi.fn() },
    auditLog: { create: vi.fn() }
  },
  user: { id: "owner-1", name: "Owner", role: "OWNER" },
  cancelErpSales: vi.fn(),
  recordAudit: vi.fn(),
  findTipe: vi.fn(),
  listAllRekeningAccounts: vi.fn(),
  resolveSalesRekening: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => mocks.user) }));
vi.mock("@/lib/api/salesCancellations", () => ({ cancelErpSales: mocks.cancelErpSales }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/business/masterData", () => ({ findTipe: mocks.findTipe, listAllRekeningAccounts: mocks.listAllRekeningAccounts, resolveSalesRekening: mocks.resolveSalesRekening }));

import { cancelSalesRecord, filterSalesRecordsInMemory, getSalesRecord, listSalesRecords, listSalesRecordsPage, saveSalesRecord, updateSalesRecord } from "@/lib/sales/store";

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
  rekeningNameSnapshot: "Kas Lama",
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
    mocks.prisma.salesRecord.update.mockResolvedValue(dbSale);
    mocks.prisma.tempoReceivable.findUnique.mockReset();
    mocks.prisma.tempoReceivable.update.mockReset();
    mocks.prisma.tempoPaymentReversal.upsert.mockReset();
    mocks.prisma.auditLog.create.mockReset();
    mocks.prisma.salesRecordItem.deleteMany.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.prisma) => unknown) => callback(mocks.prisma));
    mocks.cancelErpSales.mockReset();
    mocks.recordAudit.mockReset();
    mocks.findTipe.mockReset();
    mocks.listAllRekeningAccounts.mockReset();
    mocks.resolveSalesRekening.mockReset();
    mocks.findTipe.mockResolvedValue({ id: "W", code: "W", name: "Walk In" });
    mocks.listAllRekeningAccounts.mockResolvedValue([]);
    mocks.resolveSalesRekening.mockResolvedValue({ id: "cash-w", name: "Kas Walk In" });
    mocks.prisma.tempoReceivable.findUnique.mockResolvedValue(null);
    mocks.prisma.auditLog.create.mockResolvedValue({});
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
      rekeningId: "cash-w",
      rekeningNameSnapshot: "Kas Walk In",
      total: 5000,
      approvalStatus: "approved",
      createdByUserId: "owner-1",
      createdByNameSnapshot: "Owner",
      createdByRoleSnapshot: "OWNER",
      items: [{ productRef: "P-2", quantity: 1, unitPrice: 5000, discount: 0 }]
    });

    expect(mocks.prisma.salesRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        rekeningId: "cash-w",
        rekeningNameSnapshot: "Kas Walk In",
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
      AND: [expect.objectContaining({ OR: [{ rekeningId: "bca" }, { rekeningNameSnapshot: "bca" }, { transferAccount: "bca" }] })]
    });
    expect(mocks.prisma.salesRecord.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(mocks.prisma.salesRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
  });

  it("applies creator scope in PostgreSQL before counting and pagination", async () => {
    mocks.prisma.salesRecord.count.mockResolvedValue(1);
    mocks.prisma.salesRecord.findMany.mockResolvedValue([{ ...dbSale, createdByUserId: "admin-1" }]);

    await expect(listSalesRecordsPage({
      page: 2,
      pageSize: 10,
      scope: { createdByUserId: "admin-1" },
    })).resolves.toMatchObject({ meta: { page: 2, total: 1 } });

    expect(mocks.prisma.salesRecord.count).toHaveBeenCalledWith({ where: { createdByUserId: "admin-1" } });
    expect(mocks.prisma.salesRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdByUserId: "admin-1" },
      skip: 10,
      take: 10,
    }));
  });

  it("applies creator scope to merged development records and fails closed for missing creators", () => {
    const scopedSale = (id: string, createdByUserId: string): Sale => ({
      id,
      saleDate: "2026-06-27",
      customerName: "Budi",
      customerLocation: "Toko",
      shippingMethod: "di Tempat",
      paymentMethod: "Cash",
      total: 20000,
      createdByUserId,
      createdByNameSnapshot: "Admin",
      createdByRoleSnapshot: "ADMIN",
      items: [{ productRef: "P-1", quantity: 2, unitPrice: 10000, discount: 0 }],
    });

    expect(filterSalesRecordsInMemory(
      [scopedSale("S-OWN", "admin-1"), scopedSale("S-OTHER", "admin-2"), scopedSale("S-LEGACY", "")],
      {},
      { createdByUserId: "admin-1" },
    ).map((sale) => sale.id)).toEqual(["S-OWN"]);
  });

  it("allows editing synced ERP sales before release while preserving ERP reference for PUT retry", async () => {
    const syncedSale = {
      ...dbSale,
      syncTarget: "erp",
      syncStatus: "synced",
      erpReference: "SLM-SALE-1",
      stockReleaseStatus: "pending",
      erpPaymentStatus: "pending"
    };
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(syncedSale);
    mocks.prisma.salesRecord.update.mockResolvedValue({
      ...syncedSale,
      total: 30000,
      syncStatus: "pending",
      syncError: "Transaksi diubah dan menunggu sinkronisasi ulang.",
      syncedAt: null,
      erpReference: "SLM-SALE-1",
      stockReleaseStatus: "pending",
      erpPaymentStatus: "pending"
    });

    await expect(updateSalesRecord("S-1", {
      saleDate: "2026-06-27",
      tipeId: "W",
      customerName: "Budi",
      customerLocation: "Toko",
      shippingMethod: "di Tempat",
      paymentMethod: "Cash",
      rekeningId: "cash-w",
      items: [{ productRef: "P-1", quantity: 3, unitPrice: 10000, discount: 0 }]
    })).resolves.toMatchObject({ syncStatus: "pending", erpReference: "SLM-SALE-1" });

    expect(mocks.prisma.salesRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        rekeningNameSnapshot: "Kas Lama",
        syncStatus: "pending",
        erpReference: "SLM-SALE-1",
        stockReleaseStatus: "pending",
        erpPaymentStatus: "pending"
      })
    }));
  });

  it("stores the server-resolved snapshot when the selected rekening changes", async () => {
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(dbSale);
    mocks.resolveSalesRekening.mockResolvedValue({ id: "bca-w", name: "BCA Operasional" });
    mocks.prisma.salesRecord.update.mockResolvedValue({
      ...dbSale,
      paymentMethod: "TF",
      rekeningId: "bca-w",
      rekeningNameSnapshot: "BCA Operasional"
    });

    await updateSalesRecord("S-1", {
      saleDate: "2026-06-27",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      customerName: "Budi",
      customerLocation: "Toko",
      shippingMethod: "di Tempat",
      paymentMethod: "TF",
      rekeningId: "bca-w",
      rekeningNameSnapshot: "Nama Palsu Client",
      items: [{ productRef: "P-1", quantity: 2, unitPrice: 10000, discount: 0 }]
    });

    expect(mocks.prisma.salesRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        rekeningId: "bca-w",
        rekeningNameSnapshot: "BCA Operasional"
      })
    }));
  });

  it("allows an unchanged inactive legacy rekening and fills its missing snapshot", async () => {
    const legacySale = { ...dbSale, rekeningNameSnapshot: null };
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(legacySale);
    mocks.listAllRekeningAccounts.mockResolvedValue([{
      id: "cash-w",
      name: "Kas Walk In Nonaktif",
      bank: "Cash",
      accountNumber: "-",
      isActive: false,
      tipeIds: ["W"]
    }]);
    mocks.prisma.salesRecord.update.mockResolvedValue({
      ...legacySale,
      rekeningNameSnapshot: "Kas Walk In Nonaktif"
    });

    await updateSalesRecord("S-1", {
      saleDate: "2026-06-27",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      customerName: "Budi",
      customerLocation: "Toko",
      shippingMethod: "di Tempat",
      paymentMethod: "Tempo",
      rekeningId: "cash-w",
      items: [{ productRef: "P-1", quantity: 2, unitPrice: 10000, discount: 0 }]
    });

    expect(mocks.resolveSalesRekening).not.toHaveBeenCalled();
    expect(mocks.prisma.salesRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ rekeningNameSnapshot: "Kas Walk In Nonaktif" })
    }));
  });

  it("updates the Jakarta transaction date without changing its issued transaction number", async () => {
    const numberedSale = {
      ...dbSale,
      transactionNumber: "270626-01",
      transactionAt: new Date("2026-06-26T17:05:00.000Z"),
      transactionSequence: 1,
      transactionDateKey: "2026-06-27",
      syncTarget: "local",
      syncStatus: "local",
      stockReleaseStatus: "not_required",
      erpPaymentStatus: "not_required"
    };
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(numberedSale);
    mocks.prisma.salesRecord.update.mockResolvedValue({
      ...numberedSale,
      saleDate: new Date("2026-06-28"),
      transactionAt: new Date("2026-06-27T17:10:00.000Z")
    });

    await expect(updateSalesRecord("S-1", {
      saleDate: "2026-06-27",
      transactionAt: "2026-06-28T00:10",
      deliveryAt: "2026-06-28T01:00",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      customerName: "Budi",
      customerLocation: "Toko",
      shippingMethod: "di Tempat",
      paymentMethod: "Cash",
      rekeningId: "cash-w",
      items: [{ productRef: "P-1", quantity: 2, unitPrice: 10000, discount: 0 }]
    })).resolves.toMatchObject({
      saleDate: "2026-06-28",
      transactionNumber: "270626-01",
      transactionDateKey: "2026-06-27"
    });

    const updateData = mocks.prisma.salesRecord.update.mock.calls[0][0].data;
    expect(updateData.saleDate).toEqual(new Date("2026-06-28"));
    expect(updateData.transactionAt).toEqual(new Date("2026-06-27T17:10:00.000Z"));
    expect(updateData.deliveryAt).toEqual(new Date("2026-06-27T18:00:00.000Z"));
    expect(updateData).not.toHaveProperty("transactionNumber");
    expect(updateData).not.toHaveProperty("transactionSequence");
    expect(updateData).not.toHaveProperty("transactionDateKey");
  });

  it("blocks editing synced ERP sales after stock release or payment settlement", async () => {
    mocks.prisma.salesRecord.findUnique.mockResolvedValue({
      ...dbSale,
      syncTarget: "erp",
      syncStatus: "synced",
      erpReference: "SLM-INV-1",
      erpInvoiceNumber: "SLM-INV-1",
      stockReleaseReference: "SLM-STOCK-1",
      erpPaymentReference: "SLM-PAY-1",
      stockReleaseStatus: "released",
      erpPaymentStatus: "paid"
    });

    await expect(updateSalesRecord("S-1", {
      saleDate: "2026-06-27",
      tipeId: "W",
      customerName: "Budi",
      customerLocation: "Toko",
      shippingMethod: "di Tempat",
      paymentMethod: "Cash",
      rekeningId: "cash-w",
      items: [{ productRef: "P-1", quantity: 3, unitPrice: 10000, discount: 0 }]
    })).rejects.toThrow("ERP menolak update transaksi karena transaksi sudah masuk proses lanjutan. Batalkan transaksi lama di ERP lalu buat transaksi koreksi baru dengan ERP reference baru.");

    expect(mocks.prisma.salesRecord.update).not.toHaveBeenCalled();
  });

  it("does not translate a Prisma update failure into a missing transaction", async () => {
    mocks.prisma.salesRecord.findUnique.mockResolvedValue({
      ...dbSale,
      syncTarget: "local",
      syncStatus: "local",
      stockReleaseStatus: "not_required",
      erpPaymentStatus: "not_required"
    });
    mocks.prisma.salesRecord.update.mockRejectedValue(Object.assign(new Error("deliveryAt column missing"), { code: "P2022" }));

    await expect(updateSalesRecord("S-1", {
      saleDate: "2026-06-27",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      tipeNameSnapshot: "Walk In",
      customerName: "Budi",
      customerLocation: "Toko",
      shippingMethod: "di Tempat",
      paymentMethod: "Cash",
      rekeningId: "cash-w",
      items: [{ productRef: "P-1", quantity: 2, unitPrice: 10000, discount: 0 }]
    })).rejects.toMatchObject({ code: "P2022", message: "deliveryAt column missing" });
  });

  it("cancels synced ERP sales through Aneka Jaya before updating local status", async () => {
    const syncedSale = {
      ...dbSale,
      syncTarget: "erp",
      syncStatus: "synced",
      syncError: null,
      erpReference: "SLM-INV-1",
      erpInvoiceNumber: "SLM-INV-1",
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
      erpReference: "SLM-INV-1",
      erpInvoiceNumber: "SLM-INV-1"
    });
    mocks.cancelErpSales.mockResolvedValue({ success: false, message: "Invoice ERP tidak bisa dibatalkan." });

    await expect(cancelSalesRecord("S-1", "Customer batal")).rejects.toThrow("Invoice ERP tidak bisa dibatalkan.");

    expect(mocks.prisma.salesRecord.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ syncError: expect.stringContaining("perlu rekonsiliasi") }) }));
  });
});
