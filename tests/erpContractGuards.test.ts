import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "OWNER",
  createStockAdjustment: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: vi.fn(async () => mocks.role)
}));

vi.mock("@/lib/api/stockAdjustments", () => ({
  createStockAdjustment: mocks.createStockAdjustment
}));

import { POST as adjustStock } from "@/app/api/stocks/adjust/route";
import { POST as correctSalesErp } from "@/app/api/sales/[id]/erp-correction/route";
import { POST as correctExpenseErp } from "@/app/api/expenses/[id]/erp-correction/route";

describe("pending ERP contract guards", () => {
  beforeEach(() => {
    mocks.role = "OWNER";
    mocks.createStockAdjustment.mockReset();
  });

  it("uses the verified ERP stock adjustment adapter for owner requests", async () => {
    mocks.createStockAdjustment.mockResolvedValue({ success: true, data: { id: 123 } });
    const response = await adjustStock(new Request("http://local/api/stocks/adjust", {
      method: "POST",
      body: JSON.stringify({
        warehouseId: 1,
        adjustmentType: "increase",
        reason: "Koreksi stok opname",
        approveNow: true,
        items: [{ productId: 10, rakId: 2, differenceQty: 3 }]
      })
    }));

    expect(response.status).toBe(201);
    expect(mocks.createStockAdjustment).toHaveBeenCalledWith(expect.objectContaining({
      warehouseId: 1,
      adjustmentType: "increase",
      items: [expect.objectContaining({ productId: 10, rakId: 2, differenceQty: 3 })]
    }));
  });

  it("validates stock adjustment payloads before calling ERP", async () => {
    const response = await adjustStock(new Request("http://local/api/stocks/adjust", {
      method: "POST",
      body: JSON.stringify({ warehouseId: 1 })
    }));

    expect(response.status).toBe(400);
    expect(mocks.createStockAdjustment).not.toHaveBeenCalled();
  });

  it("keeps synced sales correction disabled until the ERP contract is available", async () => {
    const response = await correctSalesErp();

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "ERP_CONTRACT_PENDING",
      message: expect.stringContaining("Koreksi transaksi AJ")
    });
  });

  it("keeps synced expense correction disabled until the ERP contract is available", async () => {
    const response = await correctExpenseErp();

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "ERP_CONTRACT_PENDING",
      message: expect.stringContaining("Koreksi/cancel pengeluaran AJ")
    });
  });

  it("rejects non-owner roles before revealing pending contract details", async () => {
    mocks.role = "ADMIN";

    await expect(adjustStock(new Request("http://local/api/stocks/adjust", { method: "POST", body: "{}" }))).resolves.toMatchObject({ status: 403 });
    await expect(correctSalesErp()).resolves.toMatchObject({ status: 403 });
    await expect(correctExpenseErp()).resolves.toMatchObject({ status: 403 });
  });
});
