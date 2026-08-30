import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  anikaRequest: vi.fn()
}));

vi.mock("@/lib/api/anikaClient", () => ({ anikaRequest: mocks.anikaRequest }));

import { buildStockReleasePayload, cancelStockRelease, nextRevisionReference, releaseSaleStock } from "@/lib/api/stockReleases";

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
      .resolves.toMatchObject({ success: false, message: "Stok di gudang tidak mencukupi untuk release barang." });
  });

  it("extracts specific product shortage details when stock_insufficient error returns error items", async () => {
    mocks.anikaRequest.mockResolvedValueOnce({
      success: false,
      code: "stock_insufficient",
      details: {
        upstreamCode: "stock_insufficient",
        errors: {
          items: [
            { product_id: 10, sku: "BRG-001", product_name: "Semen Tiga Roda", requested_qty: 5, available_qty: 2, shortage_qty: 3 }
          ]
        }
      }
    });

    await expect(releaseSaleStock({ saleId: "S-1", saleDate: "2026-07-13", erpReference: "INV-1", items }))
      .resolves.toMatchObject({
        success: false,
        message: "Stok di gudang tidak mencukupi untuk item: Semen Tiga Roda (minta: 5, tersedia: 2)."
      });
  });

  it("reports specific missing product skus when product_invalid error is returned", async () => {
    mocks.anikaRequest.mockResolvedValueOnce({
      success: false,
      code: "product_invalid",
      details: {
        upstreamCode: "product_invalid",
        errors: [{ item_index: 0, product_id: null, sku: "BRG-001 Kain Katun Premium A1" }]
      }
    });

    await expect(releaseSaleStock({ saleId: "S-1", saleDate: "2026-07-13", erpReference: "INV-1", items }))
      .resolves.toMatchObject({
        success: false,
        message: "Produk berikut tidak ditemukan di master data ERP Aneka Jaya: BRG-001 Kain Katun Premium A1."
      });
  });

  it("calls /stock-releases/cancel to reverse stock release", async () => {
    mocks.anikaRequest.mockResolvedValueOnce({ success: true, data: { status: "reversed", message: "Stok berhasil dikembalikan" } });

    await expect(cancelStockRelease({ reference: "SLM-STOCK-INV-1", reason: "Edit transaksi kasir" }))
      .resolves.toMatchObject({ success: true, data: { status: "reversed" } });

    expect(mocks.anikaRequest).toHaveBeenCalledWith("/stock-releases/cancel", {
      method: "POST",
      body: JSON.stringify({ reference: "SLM-STOCK-INV-1", reason: "Edit transaksi kasir" })
    });
  });

  it("generates incremental revision references for storno and re-release", () => {
    expect(nextRevisionReference("SLM-STOCK-INV-1")).toBe("SLM-STOCK-INV-1-REV1");
    expect(nextRevisionReference("SLM-STOCK-INV-1-REV1")).toBe("SLM-STOCK-INV-1-REV2");
    expect(nextRevisionReference("SLM-STOCK-INV-1-REV2")).toBe("SLM-STOCK-INV-1-REV3");
  });
});
