import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  anikaRequest: vi.fn(),
  recordAudit: vi.fn(),
  user: { id: "owner-1", name: "Owner", role: "OWNER" }
}));

vi.mock("@/lib/api/anikaClient", () => ({ anikaRequest: mocks.anikaRequest }));
vi.mock("@/lib/audit/store", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => mocks.user) }));

import { createStockAdjustment } from "@/lib/api/stockAdjustments";

describe("stock adjustment ERP adapter", () => {
  beforeEach(() => {
    mocks.anikaRequest.mockReset();
    mocks.recordAudit.mockReset();
  });

  it("posts the verified ERP /stock-adjustments payload shape", async () => {
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { id: 9 } });

    await expect(createStockAdjustment({
      adjustmentNumber: "ADJ-1",
      adjustmentDate: "2026-06-30",
      warehouseId: 1,
      adjustmentType: "increase",
      reason: "Stock opname",
      approveNow: true,
      items: [{ productId: 10, rakId: 2, currentQty: 5, adjustedQty: 8, differenceQty: 3, unitCost: 1000 }]
    })).resolves.toMatchObject({ success: true });

    expect(mocks.anikaRequest).toHaveBeenCalledWith("/stock-adjustments", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        adjustment_number: "ADJ-1",
        adjustment_date: "2026-06-30",
        warehouse_id: 1,
        adjustment_type: "increase",
        reason: "Stock opname",
        notes: undefined,
        created_by: undefined,
        approved_by: undefined,
        approve_now: true,
        items: [{
          product_id: 10,
          rak_id: 2,
          current_qty: 5,
          adjusted_qty: 8,
          difference_qty: 3,
          unit_cost: 1000,
          difference_value: undefined,
          notes: undefined
        }]
      })
    }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "stock",
      action: "update",
      afterValue: expect.objectContaining({ warehouseId: 1, itemCount: 1, success: true })
    }));
  });

  it("records a safe audit summary when ERP rejects the adjustment", async () => {
    mocks.anikaRequest.mockResolvedValue({ success: false, code: "ERP_AUTH", message: "Akses ditolak" });

    await expect(createStockAdjustment({
      warehouseId: 1,
      adjustmentType: "decrease",
      reason: "Rusak",
      approveNow: true,
      items: [{ productId: 10, rakId: 2, differenceQty: -1 }]
    })).resolves.toMatchObject({ success: false });

    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "stock",
      action: "retry_sync",
      afterValue: expect.objectContaining({ success: false, code: "ERP_AUTH" }),
      reason: expect.stringContaining("Stock adjustment gagal ERP")
    }));
  });
});
