import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ApprovalForbiddenError extends Error {
    constructor(message = "Tidak punya akses approval.") {
      super(message);
      this.name = "ApprovalForbiddenError";
    }
  }

  return {
    role: "OWNER",
    getProduct: vi.fn(),
    listProducts: vi.fn(),
    listProductTableItems: vi.fn(),
    listProductTablePage: vi.fn(),
    listStocks: vi.fn(),
    listBookkeepingTypes: vi.fn(),
    listRekeningAccounts: vi.fn(),
    listAllRekeningAccounts: vi.fn(),
    saveBookkeepingTypes: vi.fn(),
    saveRekeningAccounts: vi.fn(),
    getOpenCloudStatus: vi.fn(),
    checkStockMinimumAlert: vi.fn(),
    updateApprovalStatus: vi.fn(),
    ApprovalForbiddenError
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn(async () => mocks.role),
  getCurrentUser: vi.fn(async () => ({ id: "test-user", name: "Test User", role: mocks.role }))
}));

vi.mock("@/lib/api/products", () => ({
  getProduct: mocks.getProduct,
  listProducts: mocks.listProducts,
  listProductTableItems: mocks.listProductTableItems,
  listProductTablePage: mocks.listProductTablePage
}));

vi.mock("@/lib/api/stocks", () => ({
  listStocks: mocks.listStocks
}));

vi.mock("@/lib/stockAlerts/store", () => ({
  checkStockMinimumAlert: mocks.checkStockMinimumAlert
}));

vi.mock("@/lib/audit/store", () => ({
  recordAudit: vi.fn()
}));

vi.mock("@/lib/business/masterData", () => ({
  listBookkeepingTypes: mocks.listBookkeepingTypes,
  listRekeningAccounts: mocks.listRekeningAccounts,
  listAllRekeningAccounts: mocks.listAllRekeningAccounts,
  saveBookkeepingTypes: mocks.saveBookkeepingTypes,
  saveRekeningAccounts: mocks.saveRekeningAccounts
}));

vi.mock("@/lib/opencloud/auth", () => ({
  getOpenCloudStatus: mocks.getOpenCloudStatus
}));

vi.mock("@/lib/approval/store", () => ({
  ApprovalForbiddenError: mocks.ApprovalForbiddenError,
  isApprovalAction: (value: unknown) => value === "approve" || value === "reject",
  updateApprovalStatus: mocks.updateApprovalStatus
}));

import { POST as approveApproval } from "@/app/api/approval/[id]/route";
import { GET as getHealth } from "@/app/api/health/route";
import { GET as getProducts } from "@/app/api/products/route";
import { GET as getProductDetail } from "@/app/api/products/[id]/route";
import { GET as getRekening, POST as postRekening } from "@/app/api/rekening/route";
import { GET as getStocks } from "@/app/api/stocks/route";
import { GET as getTipe, POST as postTipe } from "@/app/api/tipe/route";

describe("api route permission enforcement", () => {
  beforeEach(() => {
    mocks.role = "OWNER";
    mocks.getProduct.mockReset();
    mocks.listProducts.mockReset();
    mocks.listProductTableItems.mockReset();
    mocks.listProductTablePage.mockReset();
    mocks.listStocks.mockReset();
    mocks.listBookkeepingTypes.mockReset();
    mocks.listRekeningAccounts.mockReset();
    mocks.listAllRekeningAccounts.mockReset();
    mocks.saveBookkeepingTypes.mockReset();
    mocks.saveRekeningAccounts.mockReset();
    mocks.getOpenCloudStatus.mockReset();
    mocks.checkStockMinimumAlert.mockReset();
    mocks.updateApprovalStatus.mockReset();
  });

  it("rejects product detail for roles without stock.view", async () => {
    mocks.role = "FINANCE";

    const response = await getProductDetail(new Request("http://local/api/products/P-1"), { params: Promise.resolve({ id: "P-1" }) });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.getProduct).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "ADMIN"])("allows product detail for %s", async (role) => {
    mocks.role = role;
    mocks.getProduct.mockResolvedValue({ success: true, data: { id: "P-1", code: "P-1", name: "Produk" } });

    const response = await getProductDetail(new Request("http://local/api/products/P-1"), { params: Promise.resolve({ id: "P-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.getProduct).toHaveBeenCalledWith("P-1");
  });

  it("returns table-scoped products from the list endpoint", async () => {
    mocks.role = "ADMIN";
    mocks.listProductTableItems.mockResolvedValue({
      success: true,
      data: [{ id: "P-1", code: "P-1", name: "Produk", category: null, sellingPrice: null, minimumStock: null, isActive: null, updatedAt: "2026-06-29T10:00:00.000Z" }]
    });

    const response = await getProducts(new Request("http://local/api/products"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [{ id: "P-1", code: "P-1", name: "Produk", category: null, sellingPrice: null, minimumStock: null, isActive: null, updatedAt: "2026-06-29T10:00:00.000Z" }]
    });
    expect(mocks.listProductTableItems).toHaveBeenCalled();
  });

  it("returns paginated products when page query is provided", async () => {
    mocks.role = "ADMIN";
    mocks.listProductTablePage.mockResolvedValue({
      success: true,
      data: {
        data: [{ id: "P-1", code: "P-1", name: "Produk", category: null, sellingPrice: null, minimumStock: null, isActive: null, updatedAt: "2026-06-29T10:00:00.000Z" }],
        meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 }
      }
    });

    const response = await getProducts(new Request("http://local/api/products?page=1&pageSize=50&keyword=produk"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 } }
    });
    expect(mocks.listProductTablePage).toHaveBeenCalledWith({ page: 1, pageSize: 50, keyword: "produk" });
  });

  it("uses the shared current-role resolver for stocks, so trusted-header roles work", async () => {
    mocks.role = "ADMIN";
    mocks.listStocks.mockResolvedValue({ success: true, data: [] });

    const response = await getStocks();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: [] });
    expect(mocks.listStocks).toHaveBeenCalled();
  });

  it("returns 403 when approval permission is missing", async () => {
    mocks.updateApprovalStatus.mockRejectedValue(new mocks.ApprovalForbiddenError());

    const response = await approveApproval(
      new Request("http://local/api/approval/APR-1", { method: "POST", body: JSON.stringify({ action: "approve" }) }),
      { params: Promise.resolve({ id: "APR-1" }) }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, message: "Tidak punya akses approval." });
  });

  it("rejects rekening listing for viewer roles", async () => {
    mocks.role = "VIEWER";

    const response = await getRekening(new Request("http://local/api/rekening"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.listRekeningAccounts).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "FINANCE", "MANAGER"])("allows rekening listing for %s operational roles", async (role) => {
    mocks.role = role;
    mocks.listRekeningAccounts.mockResolvedValue([{ id: "cash", name: "Kas", bank: "Cash", accountNumber: "-", tipeIds: ["AJ"] }]);

    const response = await getRekening(new Request("http://local/api/rekening"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: expect.any(Array) });
    expect(mocks.listRekeningAccounts).toHaveBeenCalled();
  });

  it("rejects tipe listing for viewer roles", async () => {
    mocks.role = "VIEWER";

    const response = await getTipe();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.listBookkeepingTypes).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "FINANCE", "MANAGER"])("allows tipe listing for %s roles with master data view", async (role) => {
    mocks.role = role;
    mocks.listBookkeepingTypes.mockResolvedValue([{ id: "AJ", code: "AJ", name: "AJ", isActive: true, sortOrder: 1 }]);

    const response = await getTipe();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: expect.any(Array) });
    expect(mocks.listBookkeepingTypes).toHaveBeenCalled();
  });

  it("keeps tipe and rekening mutation restricted to settings managers", async () => {
    mocks.role = "MANAGER";

    const tipeResponse = await postTipe(new Request("http://local/api/tipe", { method: "POST", body: JSON.stringify({ code: "X", name: "X" }) }));
    const rekeningResponse = await postRekening(new Request("http://local/api/rekening", { method: "POST", body: JSON.stringify({ bank: "Cash", name: "Kas" }) }));

    expect(tipeResponse.status).toBe(403);
    expect(rekeningResponse.status).toBe(403);
  });

  it("rejects invalid tipe create payloads server-side", async () => {
    mocks.role = "OWNER";

    const response = await postTipe(new Request("http://local/api/tipe", { method: "POST", body: JSON.stringify({ code: "", name: "" }) }));

    expect(response.status).toBe(400);
    expect(mocks.saveBookkeepingTypes).not.toHaveBeenCalled();
  });

  it("rejects duplicate tipe codes with a clear conflict", async () => {
    mocks.role = "OWNER";
    mocks.listBookkeepingTypes.mockResolvedValue([{ id: "tipe-aj", code: "AJ", name: "AJ", isActive: true, sortOrder: 1 }]);

    const response = await postTipe(new Request("http://local/api/tipe", { method: "POST", body: JSON.stringify({ code: "aj", name: "Aneka Jaya" }) }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, message: expect.stringContaining("AJ") });
    expect(mocks.saveBookkeepingTypes).not.toHaveBeenCalled();
  });

  it("rejects invalid rekening bank server-side", async () => {
    mocks.role = "OWNER";

    const response = await postRekening(new Request("http://local/api/rekening", { method: "POST", body: JSON.stringify({ bank: "Bank Tidak Ada", name: "Rekening Test" }) }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, message: "Bank rekening tidak valid." });
    expect(mocks.saveRekeningAccounts).not.toHaveBeenCalled();
  });

  it("does not expose integration details from health checks for non-owner roles", async () => {
    mocks.role = "VIEWER";

    const response = await getHealth();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(mocks.listProducts).not.toHaveBeenCalled();
    expect(mocks.getOpenCloudStatus).not.toHaveBeenCalled();
  });
});
