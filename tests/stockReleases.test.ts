import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  anikaRequest: vi.fn()
}));

vi.mock("@/lib/api/anikaClient", () => ({ anikaRequest: mocks.anikaRequest }));

import { buildStockReleasePayload, releaseSaleStock } from "@/lib/api/stockReleases";

const items = [{
  productRef: "BRG-001",
  productId: "1",
  warehouseId: "2",
  warehouseNameSnapshot: "Gudang Utama",
  rackId: "5",
  rackNameSnapshot: "Rak A",
  quantity: 2,
  unitPrice: 10000
}];

describe("ERP stock releases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a stock release payload from sales items and ERP reference", () => {
    const result = buildStockReleasePayload({ saleId: "S-1", saleDate: "2026-07-13", erpReference: "INV-1", items });

    expect(result).toMatchObject({
      success: true,
      data: {
        releaseReference: "SLM-STOCK-INV-1",
        payload: {
          erp_reference: "SLM-STOCK-INV-1",
          source: "SLM",
          source_type: "invoice",
          source_number: "INV-1",
          release_date: "2026-07-13",
          warehouse_id: 2,
          items: [{ product_id: 1, sku: "BRG-001", quantity: 2, warehouse_id: 2, rak_id: 5 }]
        }
      }
    });
  });

  it("treats released and already_released as successful idempotent responses", async () => {
    mocks.anikaRequest.mockResolvedValueOnce({ success: true, data: { status: "already_released" } });

    await expect(releaseSaleStock({ saleId: "S-1", saleDate: "2026-07-13", erpReference: "INV-1", items }))
      .resolves.toMatchObject({ success: true, data: { status: "already_released", releaseReference: "SLM-STOCK-INV-1" } });
  });

  it("maps upstream release errors to operational messages", async () => {
    mocks.anikaRequest.mockResolvedValueOnce({ success: false, code: "ERP_VALIDATION", message: "raw", details: { upstreamCode: "stock_insufficient" } });

    await expect(releaseSaleStock({ saleId: "S-1", saleDate: "2026-07-13", erpReference: "INV-1", items }))
      .resolves.toMatchObject({ success: false, message: "Stok ERP tidak cukup untuk release." });
  });
});
