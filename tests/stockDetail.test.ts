import { beforeEach, describe, expect, it, vi } from "vitest";
import { stockDetailHref, stockDetailReturnTo, summarizeStockDetail } from "@/lib/stocks/detail";

const mocks = vi.hoisted(() => ({
  listErpPaginated: vi.fn()
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/pagination", () => ({
  listErpPaginated: mocks.listErpPaginated
}));

import { getStockDetail } from "@/lib/api/stocks";

describe("stock detail", () => {
  beforeEach(() => {
    mocks.listErpPaginated.mockReset();
  });

  it("builds an encoded detail URL with a safe return path", () => {
    expect(stockDetailHref({ id: "fallback", productId: "P/1", sku: "SKU A" }, "/stok-barang?page=2")).toBe(
      "/stok-barang/P%2F1?sku=SKU+A&returnTo=%2Fstok-barang%3Fpage%3D2"
    );
    expect(stockDetailHref({ id: "SKU-2", sku: "SKU-2" }, "https://invalid.example")).toBe(
      "/stok-barang/SKU-2?sku=SKU-2"
    );
    expect(stockDetailReturnTo("//invalid.example")).toBe("/stok-barang");
  });

  it("uses product id without combining it with the SKU filter", async () => {
    mocks.listErpPaginated.mockResolvedValue({
      success: true,
      data: [{ id: "S-1", product_id: "12", product_sku: "SKU-12", product_name: "Produk 12", quantity: 4 }]
    });

    const result = await getStockDetail("12", "SKU-12");

    expect(result.success).toBe(true);
    expect(mocks.listErpPaginated).toHaveBeenCalledTimes(1);
    expect(mocks.listErpPaginated.mock.calls[0][1].query).toMatchObject({ product_id: "12" });
    expect(mocks.listErpPaginated.mock.calls[0][1].query.product_sku).toBeUndefined();
  });

  it("falls back to SKU when product id returns no stock", async () => {
    mocks.listErpPaginated
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: "S-2", product_id: "44", product_sku: "SKU-44", product_name: "Produk 44", quantity: 3 }]
      });

    const result = await getStockDetail("legacy-44", "SKU-44");

    expect(result).toMatchObject({ success: true, data: { lookup: "sku", sku: "SKU-44" } });
    expect(mocks.listErpPaginated).toHaveBeenCalledTimes(2);
    expect(mocks.listErpPaginated.mock.calls[1][1].query).toMatchObject({ product_sku: "SKU-44" });
    expect(mocks.listErpPaginated.mock.calls[1][1].query.product_id).toBeUndefined();
  });

  it("preserves ERP failures and handles an empty result", async () => {
    mocks.listErpPaginated.mockResolvedValueOnce({ success: false, code: "ERP_TIMEOUT", message: "ERP timeout." });
    await expect(getStockDetail("12", "SKU-12")).resolves.toMatchObject({ success: false, code: "ERP_TIMEOUT" });

    mocks.listErpPaginated
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] });
    await expect(getStockDetail("12", "SKU-12")).resolves.toMatchObject({
      success: true,
      data: { stocks: [], lookup: "sku" }
    });
  });

  it("summarizes multiple warehouse rows using only known values", () => {
    expect(summarizeStockDetail([
      { id: "1", productCode: "SKU", productName: "Produk", warehouse: "A", rack: "R1", quantity: 4, freeQuantity: 3, onHandQuantity: 5, reservedQuantity: 1, minimumStock: 6, unit: "PCS" },
      { id: "2", productCode: "SKU", productName: "Produk", warehouse: "B", rack: "R2", quantity: 2, freeQuantity: null, onHandQuantity: 2, reservedQuantity: 0, minimumStock: 6, unit: "PCS" }
    ])).toMatchObject({
      quantity: 6,
      freeQuantity: 3,
      onHandQuantity: 7,
      reservedQuantity: 1,
      minimumStock: 6,
      warehouseCount: 2,
      rackCount: 2,
      ready: true,
      isLowStock: true
    });
  });
});
