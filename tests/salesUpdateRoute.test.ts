import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  role: "OWNER",
  updateSalesRecord: vi.fn(),
  getErpSyncSetting: vi.fn(),
  retrySalesErpSync: vi.fn(),
  getSalesRecord: vi.fn(),
  findSemanticDuplicateSale: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn(async () => mocks.role)
}));
vi.mock("@/lib/sales/store", () => ({ updateSalesRecord: mocks.updateSalesRecord, getSalesRecord: mocks.getSalesRecord }));
vi.mock("@/lib/sales/deduplication", () => ({ findSemanticDuplicateSale: mocks.findSemanticDuplicateSale }));
vi.mock("@/lib/settings/erpSync", () => ({ getErpSyncSetting: mocks.getErpSyncSetting }));
vi.mock("@/lib/erpSync/salesRetry", () => ({ retrySalesErpSync: mocks.retrySalesErpSync }));

import { PUT } from "@/app/api/sales/[id]/route";

const payload = {
  saleDate: "2026-07-16",
  tipeId: "AJ",
  tipeCodeSnapshot: "AJ",
  tipeNameSnapshot: "Aneka Jaya",
  customerName: "Budi",
  customerLocation: "Toko",
  shippingMethod: "di Tempat",
  paymentMethod: "Tempo",
  dueDate: "2026-07-30",
  items: [{ productRef: "SKU-1", productId: "1", quantity: 1, unitPrice: 10000, discount: 0 }]
};

describe("sales update route ERP auto sync", () => {
  beforeEach(() => {
    mocks.role = "OWNER";
    mocks.updateSalesRecord.mockReset();
    mocks.getErpSyncSetting.mockReset();
    mocks.retrySalesErpSync.mockReset();
    mocks.getSalesRecord.mockReset().mockResolvedValue({ id: "S-1", approvalStatus: "approved" });
    mocks.findSemanticDuplicateSale.mockReset().mockResolvedValue(undefined);
  });

  it("finalisasi draft memberi peringatan transaksi serupa seperti input baru", async () => {
    mocks.getSalesRecord.mockResolvedValue({ id: "DRAFT-1", approvalStatus: "draft" });
    mocks.findSemanticDuplicateSale.mockResolvedValue({ id: "S-9", transactionNumber: "TRX-9", total: 10000, createdAt: "2026-07-16T03:00:00.000Z" });

    const response = await PUT(new Request("http://local/api/sales/DRAFT-1", { method: "PUT", body: JSON.stringify(payload) }), { params: Promise.resolve({ id: "DRAFT-1" }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "DUPLICATE_SUSPECTED", details: { existingSaleId: "S-9", existingTransactionNumber: "TRX-9" } });
    expect(mocks.updateSalesRecord).not.toHaveBeenCalled();
  });

  it("simpan draft tidak memicu sinkron ERP otomatis", async () => {
    mocks.getSalesRecord.mockResolvedValue({ id: "DRAFT-1", approvalStatus: "draft" });
    mocks.updateSalesRecord.mockResolvedValue({ id: "DRAFT-1", approvalStatus: "draft", syncTarget: "erp", syncStatus: "pending" });
    mocks.getErpSyncSetting.mockResolvedValue({ autoSyncAfterSalesEdit: true });

    const response = await PUT(new Request("http://local/api/sales/DRAFT-1", { method: "PUT", body: JSON.stringify({ ...payload, isDraft: true, autoSave: true }) }), { params: Promise.resolve({ id: "DRAFT-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.findSemanticDuplicateSale).not.toHaveBeenCalled();
    expect(mocks.retrySalesErpSync).not.toHaveBeenCalled();
  });

  it("menolak simpan otomatis ke transaksi final dengan 409", async () => {
    mocks.updateSalesRecord.mockRejectedValue(Object.assign(new Error("Simpan otomatis hanya berlaku untuk draft penjualan."), { code: "NOT_A_DRAFT" }));

    const response = await PUT(new Request("http://local/api/sales/S-1", { method: "PUT", body: JSON.stringify({ ...payload, isDraft: true, autoSave: true }) }), { params: Promise.resolve({ id: "S-1" }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, code: "NOT_A_DRAFT" });
  });

  it("runs retry automatically when edited ERP sale is pending and setting is enabled", async () => {
    mocks.updateSalesRecord.mockResolvedValue({ id: "S-1", syncTarget: "erp", syncStatus: "pending" });
    mocks.getErpSyncSetting.mockResolvedValue({ autoSyncAfterSalesEdit: true });
    mocks.retrySalesErpSync.mockResolvedValue({ success: false, message: "ERP menolak update.", item: { id: "S-1", syncStatus: "failed" } });

    const response = await PUT(new Request("http://local/api/sales/S-1", {
      method: "PUT",
      body: JSON.stringify(payload)
    }), { params: Promise.resolve({ id: "S-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.retrySalesErpSync).toHaveBeenCalledWith("S-1");
    expect(await response.json()).toMatchObject({
      success: true,
      data: { id: "S-1", syncStatus: "failed" },
      autoSync: { success: false, message: "ERP menolak update." }
    });
  });

  it("keeps manual mode when setting is disabled", async () => {
    mocks.updateSalesRecord.mockResolvedValue({ id: "S-1", syncTarget: "erp", syncStatus: "pending" });
    mocks.getErpSyncSetting.mockResolvedValue({ autoSyncAfterSalesEdit: false });

    const response = await PUT(new Request("http://local/api/sales/S-1", {
      method: "PUT",
      body: JSON.stringify(payload)
    }), { params: Promise.resolve({ id: "S-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.retrySalesErpSync).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ success: true, data: { id: "S-1", syncStatus: "pending" } });
  });

  it("returns 404 only when the sales record is genuinely missing", async () => {
    mocks.updateSalesRecord.mockRejectedValue(Object.assign(new Error("Transaksi penjualan tidak ditemukan."), { code: "SALES_NOT_FOUND" }));
    const response = await PUT(new Request("http://local/api/sales/MISSING", { method: "PUT", body: JSON.stringify(payload) }), { params: Promise.resolve({ id: "MISSING" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "SALES_NOT_FOUND" });
  });

  it("reports a missing database migration instead of claiming the sale is missing", async () => {
    mocks.updateSalesRecord.mockRejectedValue(Object.assign(new Error("column deliveryAt does not exist"), { code: "P2022" }));
    const response = await PUT(new Request("http://local/api/sales/S-1", { method: "PUT", body: JSON.stringify(payload) }), { params: Promise.resolve({ id: "S-1" }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "DATABASE_MIGRATION_REQUIRED", message: expect.stringContaining("migration") });
  });

  it("allows ADMIN role to update sales transactions", async () => {
    mocks.role = "ADMIN";
    mocks.updateSalesRecord.mockResolvedValue({ id: "S-1", syncTarget: "local", syncStatus: "local" });

    const response = await PUT(new Request("http://local/api/sales/S-1", {
      method: "PUT",
      body: JSON.stringify(payload)
    }), { params: Promise.resolve({ id: "S-1" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { id: "S-1" } });
  });

  it("rejects unauthorized role from updating sales transactions", async () => {
    mocks.role = "VIEWER";

    const response = await PUT(new Request("http://local/api/sales/S-1", {
      method: "PUT",
      body: JSON.stringify(payload)
    }), { params: Promise.resolve({ id: "S-1" }) });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, message: expect.stringContaining("akses") });
  });

  it("does not expose unexpected Prisma errors as business validation", async () => {
    mocks.updateSalesRecord.mockRejectedValue(Object.assign(new Error("connection details"), { code: "P1001", name: "PrismaClientKnownRequestError" }));
    const response = await PUT(new Request("http://local/api/sales/S-1", { method: "PUT", body: JSON.stringify(payload) }), { params: Promise.resolve({ id: "S-1" }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, code: "DATABASE_ERROR", message: "Database gagal memperbarui transaksi penjualan." });
  });
});
