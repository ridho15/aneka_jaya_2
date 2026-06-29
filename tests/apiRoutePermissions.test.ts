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
    listStocks: vi.fn(),
    listBookkeepingTypes: vi.fn(),
    listRekeningAccounts: vi.fn(),
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
  listProducts: mocks.listProducts
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
  saveBookkeepingTypes: vi.fn(),
  saveRekeningAccounts: vi.fn()
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
import { GET as getProductDetail } from "@/app/api/products/[id]/route";
import { GET as getRekening } from "@/app/api/rekening/route";
import { GET as getStocks } from "@/app/api/stocks/route";
import { GET as getTipe } from "@/app/api/tipe/route";

describe("api route permission enforcement", () => {
  beforeEach(() => {
    mocks.role = "OWNER";
    mocks.getProduct.mockReset();
    mocks.listProducts.mockReset();
    mocks.listStocks.mockReset();
    mocks.listBookkeepingTypes.mockReset();
    mocks.listRekeningAccounts.mockReset();
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

  it("rejects tipe listing for viewer roles", async () => {
    mocks.role = "VIEWER";

    const response = await getTipe();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.listBookkeepingTypes).not.toHaveBeenCalled();
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
