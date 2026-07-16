import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  prisma: {
    salesRecord: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    rekeningAccount: { findMany: vi.fn() },
    tempoReceivable: { findUnique: vi.fn() },
    tempoPayment: { update: vi.fn() }
  },
  anikaRequest: vi.fn(),
  listProducts: vi.fn(),
  findProductIdBySku: vi.fn(),
  createOfficialProduct: vi.fn(),
  listErpPaginated: vi.fn(),
  recordAudit: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/api/anikaClient", () => ({ anikaRequest: mocks.anikaRequest }));
vi.mock("@/lib/api/products", () => ({ listProducts: mocks.listProducts, findProductIdBySku: mocks.findProductIdBySku, createOfficialProduct: mocks.createOfficialProduct }));
vi.mock("@/lib/api/pagination", () => ({ listErpPaginated: mocks.listErpPaginated }));
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
  stockReleaseStatus: "not_required",
  stockReleaseError: null,
  stockReleaseReference: null,
  stockReleasedAt: null,
  erpPaymentStatus: "not_required",
  erpPaymentError: null,
  erpPaymentReference: null,
  erpPaymentSyncedAt: null,
  erpPaymentAttemptedAt: null,
  testReference: null,
  isTestTransaction: false,
  createdAt: new Date("2026-06-29T09:00:00.000Z"),
  items: [{ productRef: "P-1", productId: "88", warehouseId: "1", warehouseNameSnapshot: "Gudang Utama", rackId: "5", rackNameSnapshot: "Rak A", quantity: 1, unitPrice: 10000, discount: 0, sortOrder: 0 }]
};

describe("ERP sync retry service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANIKA_ERP_AUTO_CREATE_CUSTOMER", "false");
    mocks.listErpPaginated.mockResolvedValue({ success: true, data: [{ id: 77, name: "Budi", code: "BUDI" }] });
    mocks.listProducts.mockResolvedValue({ success: true, data: [{ id: "88", productId: "88", code: "P-1", name: "Produk 1" }] });
    mocks.findProductIdBySku.mockResolvedValue({ success: true, data: undefined });
    mocks.createOfficialProduct.mockResolvedValue({ success: true, data: 99 });
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { invoice_id: "INV-1" } });
    mocks.prisma.rekeningAccount.findMany.mockResolvedValue([{ id: "cash-aj", name: "Kas AJ", accountNumber: "-", bankName: "Cash", erpCoaId: "CASH", erpCoaNameSnapshot: "Kas AJ", isActive: true, tipeLinks: [{ bookkeepingTypeId: "AJ" }] }]);
    mocks.prisma.tempoReceivable.findUnique.mockResolvedValue(null);
    mocks.prisma.tempoPayment.update.mockResolvedValue({});
  });

  it("lists ERP pending/failed rows with summary counts", async () => {
    mocks.prisma.salesRecord.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    mocks.prisma.salesRecord.findMany.mockResolvedValue([row]);

    await expect(getErpSyncOverview()).resolves.toMatchObject({
      summary: { pending: 1, failed: 2, synced: 3, totalErp: 6 },
      items: [{ id: "S-ERP-1", syncStatus: "failed", retryable: true }]
    });
  });

  it("returns an operational warning when Prisma sales storage is not generated", async () => {
    const delegate = mocks.prisma.salesRecord;
    // @ts-expect-error simulates stale Prisma Client runtime
    mocks.prisma.salesRecord = undefined;

    await expect(getErpSyncOverview()).resolves.toMatchObject({
      storageReady: false,
      warning: "Prisma Client belum tersinkron. Jalankan generate/migrate dan restart server.",
      summary: { pending: 0, failed: 0, synced: 0, totalErp: 0 },
      items: []
    });

    mocks.prisma.salesRecord = delegate;
  });

  it("marks a failed sales sync as synced when retry succeeds", async () => {
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(row);
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { invoice_id: "INV-1" } })
      .mockResolvedValueOnce({ success: true, data: { status: "released" } })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 25, customer_id: 77, remaining: 100, settlement_status: "unpaid" } } })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 12, status: "Paid" } } });
    mocks.prisma.salesRecord.update.mockResolvedValueOnce({ ...row, syncStatus: "pending" }).mockResolvedValueOnce({ ...row, syncStatus: "synced", syncError: null, erpReference: "INV-1", stockReleaseStatus: "released", stockReleaseReference: "SLM-STOCK-INV-1", erpPaymentStatus: "paid", erpPaymentReference: "12", syncedAt: new Date("2026-06-29T11:00:00.000Z") });

    await expect(retrySalesErpSync("S-ERP-1")).resolves.toMatchObject({ success: true, message: "Retry ERP, release stok, dan payment berhasil.", item: { syncStatus: "synced", stockReleaseStatus: "released", erpPaymentStatus: "paid" } });

    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"customer_id\":77")
    }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/stock-releases", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"warehouse_id\":1")
    }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales-payments", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"erp_reference\":\"SLM-PAY-S-ERP-1\"")
    }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales-payments", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"payment_account_code\":\"CASH\"")
    }));
    expect(mocks.prisma.salesRecord.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ syncStatus: "synced", syncError: null, erpReference: expect.stringMatching(/^SLM-SALE-/) })
    }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "erp_sync", action: "retry_sync" }));
  });

  it("keeps a failed status with a safe error when retry fails", async () => {
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(row);
    mocks.anikaRequest.mockResolvedValue({ success: false, code: "ERP_AUTH", message: "raw upstream detail" });
    mocks.prisma.salesRecord.update.mockResolvedValueOnce({ ...row, syncStatus: "pending" }).mockResolvedValueOnce({ ...row, syncStatus: "failed", syncError: "ERP menolak akses. Silakan cek sesi atau token ERP." });

    await expect(retrySalesErpSync("S-ERP-1")).resolves.toMatchObject({
      success: false,
      message: "ERP menolak akses. Silakan cek sesi atau token ERP.",
      item: { syncStatus: "failed" }
    });
    expect(JSON.stringify(mocks.prisma.salesRecord.update.mock.calls)).not.toContain("raw upstream detail");
  });

  it("uses PUT when retrying an edited ERP sale that already has an ERP reference", async () => {
    const editedRow = {
      ...row,
      syncStatus: "pending",
      syncError: "Transaksi diubah dan menunggu sinkronisasi ulang.",
      erpReference: "SLM-SALE-1",
      stockReleaseStatus: "pending",
      stockReleaseError: "Menunggu update invoice ERP berhasil sebelum release stok ulang.",
      erpPaymentStatus: "pending"
    };
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(editedRow);
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { status: "updated", erp_reference: "SLM-SALE-1" }, details: { status: 200, body: { status: "updated" } } })
      .mockResolvedValueOnce({ success: true, data: { status: "released" }, details: { status: 200, body: { status: "released" } } })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 25, customer_id: 77, remaining: 100, settlement_status: "unpaid" } } })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 12, status: "Paid" } } });
    mocks.prisma.salesRecord.update.mockResolvedValueOnce({ ...editedRow, syncStatus: "pending" }).mockResolvedValueOnce({ ...editedRow, syncStatus: "synced", syncError: null, stockReleaseStatus: "released", erpPaymentStatus: "paid" });

    await expect(retrySalesErpSync("S-ERP-1")).resolves.toMatchObject({
      success: true,
      item: { syncStatus: "synced", erpReference: "SLM-SALE-1" }
    });

    expect(mocks.anikaRequest).toHaveBeenNthCalledWith(1, "/sales/SLM-SALE-1", expect.objectContaining({
      method: "PUT",
      body: expect.stringContaining("\"erp_reference\":\"SLM-SALE-1\"")
    }));
    expect(mocks.anikaRequest).not.toHaveBeenCalledWith("/sales", expect.objectContaining({ method: "POST" }));
    expect(mocks.prisma.salesRecord.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        erpReference: "SLM-SALE-1",
        erpSyncHttpStatus: 200,
        stockReleaseHttpStatus: 200
      })
    }));
  });

  it("maps rejected ERP sales update to a correction workflow message", async () => {
    const editedRow = { ...row, syncStatus: "pending", erpReference: "SLM-SALE-1", stockReleaseStatus: "pending", erpPaymentStatus: "pending" };
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(editedRow);
    mocks.anikaRequest.mockResolvedValueOnce({
      success: false,
      code: "ERP_VALIDATION",
      message: "ERP menolak payload: pembayaran sudah diterima",
      details: { status: 422, upstreamCode: "validation_failed" }
    });
    mocks.prisma.salesRecord.update.mockResolvedValueOnce({ ...editedRow, syncStatus: "pending" }).mockResolvedValueOnce({
      ...editedRow,
      syncStatus: "failed",
      syncError: "ERP menolak update transaksi karena transaksi sudah masuk proses lanjutan. Batalkan transaksi lama di ERP lalu buat transaksi koreksi baru dengan ERP reference baru."
    });

    await expect(retrySalesErpSync("S-ERP-1")).resolves.toMatchObject({
      success: false,
      message: "ERP menolak update transaksi karena transaksi sudah masuk proses lanjutan. Batalkan transaksi lama di ERP lalu buat transaksi koreksi baru dengan ERP reference baru."
    });
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales/SLM-SALE-1", expect.objectContaining({ method: "PUT" }));
    expect(mocks.prisma.salesRecord.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ syncStatus: "failed", erpSyncHttpStatus: 422 })
    }));
  });

  it("stores an operational validation error and safe correlation id when ERP rejects payload", async () => {
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(row);
    mocks.anikaRequest.mockResolvedValue({ success: false, code: "ERP_VALIDATION", message: "ERP menolak payload: produk tidak ditemukan", details: { correlationId: "cid-sales-1" } });
    mocks.prisma.salesRecord.update.mockResolvedValueOnce({ ...row, syncStatus: "pending" }).mockResolvedValueOnce({ ...row, syncStatus: "failed", syncError: "ERP menolak payload: produk tidak ditemukan" });

    await expect(retrySalesErpSync("S-ERP-1")).resolves.toMatchObject({
      success: false,
      message: "ERP menolak payload: produk tidak ditemukan"
    });
    expect(mocks.prisma.salesRecord.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ syncStatus: "failed", syncError: "ERP menolak payload: produk tidak ditemukan" })
    }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      afterValue: expect.objectContaining({ correlationId: "cid-sales-1" })
    }));
  });

  it("retries batch pending/failed sales rows", async () => {
    mocks.prisma.salesRecord.findMany.mockResolvedValue([{ id: "S-ERP-1" }]);
    mocks.prisma.salesRecord.findUnique.mockResolvedValue(row);
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { id: "ERP-1" } })
      .mockResolvedValueOnce({ success: true, data: { status: "released" } })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 25, customer_id: 77, remaining: 100 } } })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 12, status: "Paid" } } });
    mocks.prisma.salesRecord.update.mockResolvedValueOnce({ ...row, syncStatus: "pending" }).mockResolvedValueOnce({ ...row, syncStatus: "synced", stockReleaseStatus: "released", erpReference: "ERP-1", syncError: null, erpPaymentStatus: "paid", syncedAt: new Date() });

    await expect(retryPendingSalesErpSync()).resolves.toMatchObject({ attempted: 1, succeeded: 1, failed: 0 });
  });

  it("does not use a fallback customer when retrying a manual customer", async () => {
    vi.stubEnv("ANIKA_ERP_FALLBACK_CUSTOMER_CODE", "WALK-IN");
    mocks.prisma.salesRecord.findUnique.mockResolvedValue({ ...row, customerName: "Customer Manual", customerLocation: "Toko Timur" });
    mocks.listErpPaginated
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] });
    mocks.prisma.salesRecord.update.mockResolvedValueOnce({ ...row, syncStatus: "pending" }).mockResolvedValueOnce({ ...row, customerName: "Customer Manual", syncStatus: "failed", syncError: "Customer ERP tidak ditemukan dan auto-create customer tidak aktif." });

    await expect(retrySalesErpSync("S-ERP-1")).resolves.toMatchObject({ success: false, item: { syncStatus: "failed" } });
    expect(mocks.listErpPaginated).toHaveBeenCalledTimes(2);
    expect(mocks.anikaRequest).not.toHaveBeenCalled();
  });

  it("uses the configured Walk In ERP customer when retrying Walk In sales", async () => {
    vi.stubEnv("ANIKA_ERP_WALK_IN_CUSTOMER_CODE", "WALK-IN");
    mocks.prisma.salesRecord.findUnique.mockResolvedValue({ ...row, tipeId: "W", tipeCodeSnapshot: "W", customerName: "Walk In", customerLocation: "Toko" });
    mocks.listErpPaginated.mockResolvedValueOnce({ success: true, data: [{ id: 88, code: "WALK-IN", name: "Walk In" }] });
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { invoice_id: "INV-WALK-IN" } })
      .mockResolvedValueOnce({ success: true, data: { status: "released" } })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 25, customer_id: 88, remaining: 100 } } })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 12, status: "Paid" } } });
    mocks.prisma.salesRecord.update.mockResolvedValueOnce({ ...row, syncStatus: "pending" }).mockResolvedValueOnce({ ...row, customerName: "Walk In", syncStatus: "synced", syncError: null, erpReference: "INV-WALK-IN", stockReleaseStatus: "released", erpPaymentStatus: "paid", syncedAt: new Date("2026-06-29T11:00:00.000Z") });

    await expect(retrySalesErpSync("S-ERP-1")).resolves.toMatchObject({ success: true, item: { syncStatus: "synced", erpReference: "INV-WALK-IN" } });
    expect(mocks.listErpPaginated).toHaveBeenCalledWith("/customers", expect.objectContaining({ query: { code: "WALK-IN" } }));
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/sales", expect.objectContaining({
      body: expect.stringContaining("\"customer_id\":88")
    }));
  });

  it("auto-creates an ERP customer when retrying a manual customer", async () => {
    vi.stubEnv("ANIKA_ERP_AUTO_CREATE_CUSTOMER", "true");
    mocks.prisma.salesRecord.findUnique.mockResolvedValue({ ...row, customerName: "Customer Manual", customerLocation: "Toko Timur" });
    mocks.listErpPaginated
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] });
    mocks.anikaRequest
      .mockResolvedValueOnce({ success: true, data: { data: { id: 123, code: "SLM-CUSTOMER" } } })
      .mockResolvedValueOnce({ success: true, data: { invoice_id: "INV-1" } })
      .mockResolvedValueOnce({ success: true, data: { status: "released" } })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 25, customer_id: 123, remaining: 100 } } })
      .mockResolvedValueOnce({ success: true, data: { data: { id: 12, status: "Paid" } } });
    mocks.prisma.salesRecord.update.mockResolvedValueOnce({ ...row, syncStatus: "pending" }).mockResolvedValueOnce({ ...row, customerName: "Customer Manual", syncStatus: "synced", syncError: null, erpReference: "INV-1", stockReleaseStatus: "released", erpPaymentStatus: "paid", syncedAt: new Date("2026-06-29T11:00:00.000Z") });

    await expect(retrySalesErpSync("S-ERP-1")).resolves.toMatchObject({ success: true, item: { syncStatus: "synced" } });
    expect(mocks.anikaRequest).toHaveBeenNthCalledWith(1, "/customers", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"name\":\"Customer Manual\"")
    }));
    const customerPayload = JSON.parse(mocks.anikaRequest.mock.calls[0][1].body);
    expect(customerPayload).toMatchObject({
      name: "Customer Manual",
      address: "Toko Timur",
      telephone: "-",
      phone: "-",
      fax: "-",
      isSpecial: "0",
      tipe: "PRI",
      tipe_pembayaran: "Bebas",
      cabang_id: 1,
      nik_npwp: "-"
    });
    for (const key of ["address", "telephone", "phone", "fax", "nik_npwp", "tipe", "tipe_pembayaran", "isSpecial", "cabang_id"]) {
      expect(customerPayload[key]).not.toBeNull();
      expect(customerPayload[key]).not.toBe("");
    }
    expect(mocks.anikaRequest).toHaveBeenNthCalledWith(2, "/sales", expect.objectContaining({
      body: expect.stringContaining("\"customer_id\":123")
    }));
  });
});
