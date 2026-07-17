import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  role: "OWNER",
  updateSalesRecord: vi.fn(),
  getErpSyncSetting: vi.fn(),
  retrySalesErpSync: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn(async () => mocks.role)
}));
vi.mock("@/lib/sales/store", () => ({ updateSalesRecord: mocks.updateSalesRecord }));
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

  it("does not expose unexpected Prisma errors as business validation", async () => {
    mocks.updateSalesRecord.mockRejectedValue(Object.assign(new Error("connection details"), { code: "P1001", name: "PrismaClientKnownRequestError" }));
    const response = await PUT(new Request("http://local/api/sales/S-1", { method: "PUT", body: JSON.stringify(payload) }), { params: Promise.resolve({ id: "S-1" }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, code: "DATABASE_ERROR", message: "Database gagal memperbarui transaksi penjualan." });
  });
});
