import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  anikaRequest: vi.fn()
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/anikaClient", () => ({
  anikaRequest: mocks.anikaRequest
}));

import { createOfficialProduct, findProductIdBySku, listProducts, paginateProductItems } from "@/lib/api/products";
import { listStocks, listStocksPage } from "@/lib/api/stocks";

describe("ERP product and stock source contract", () => {
  beforeEach(() => {
    mocks.anikaRequest.mockReset();
  });

  it("loads products from the Aneka Jaya ERP /products endpoint", async () => {
    mocks.anikaRequest.mockResolvedValue({
      success: true,
      data: { data: [{ id: "P-1", sku: "BRG-001", name: "Barang ERP", product_category: { name: "Aksesoris" }, sell_price: 1000, minimum_stock: 0, is_active: true }] }
    });

    await expect(listProducts()).resolves.toMatchObject({
      success: true,
      data: [expect.objectContaining({ code: "BRG-001", name: "Barang ERP" })]
    });
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/products?include_stock=true&per_page=100&page=1");
  });

  it("loads stocks from the Aneka Jaya ERP /stocks endpoint", async () => {
    mocks.anikaRequest.mockResolvedValue({
      success: true,
      data: { data: [{ id: "ST-1", product_code: "BRG-001", product_name: "Barang ERP", quantity: 5, minimum_stock: 1, uom: "PCS", warehouse: "Toko" }] }
    });

    await expect(listStocks()).resolves.toMatchObject({
      success: true,
      data: [expect.objectContaining({ productCode: "BRG-001", quantity: 5 })]
    });
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/stocks?per_page=100&page=1");
  });

  it("loads a filtered stock page without requiring every ERP stock page", async () => {
    mocks.anikaRequest.mockResolvedValue({
      success: true,
      data: {
        data: [
          { id: "ST-1", product_id: 7, product_sku: "BRG-001", product_name: "Barang ERP", qty_available: 5, qty_min: 1, uom: "PCS", warehouse_name: "Toko" },
          { id: "ST-2", product_id: 8, product_sku: "BRG-002", product_name: "Barang Lain", qty_available: 2, qty_min: 1, uom: "PCS", warehouse_name: "Toko" }
        ],
        meta: { current_page: 1, last_page: 20, per_page: 50, total: 1000 }
      }
    });

    await expect(listStocksPage({ productId: "7", page: 1, pageSize: 50 })).resolves.toMatchObject({
      success: true,
      data: {
        data: [expect.objectContaining({ productId: "7", productCode: "BRG-001", quantity: 5 })],
        meta: { page: 1, pageSize: 50, total: 1000, totalPages: 20 }
      }
    });
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/stocks?product_id=7&per_page=50&page=1");
  });

  it("requests the selected stock page directly from ERP", async () => {
    mocks.anikaRequest.mockResolvedValue({
      success: true,
      data: {
        data: [{ id: "ST-11", product_id: 11, product_sku: "BRG-011", product_name: "Barang Page 2", qty_available: 3, warehouse: { name: "Toko" } }],
        meta: { current_page: 2, last_page: 4, per_page: 10, total: 31 }
      }
    });

    await expect(listStocksPage({ page: 2, pageSize: 10, warehouse: "Toko" })).resolves.toMatchObject({
      success: true,
      data: {
        data: [expect.objectContaining({ productCode: "BRG-011" })],
        meta: { page: 2, pageSize: 10, total: 31, totalPages: 4 }
      }
    });
    expect(mocks.anikaRequest).toHaveBeenCalledWith("/stocks?warehouse=Toko&per_page=10&page=2");
  });

  it("does not synthesize local fallback products when ERP payload shape is invalid", async () => {
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { unexpected: true } });

    await expect(listProducts()).resolves.toMatchObject({
      success: false,
      code: "ERP_SCHEMA",
      message: "Format data produk dari ERP tidak dikenali."
    });
  });

  it("creates products through the official ERP /products endpoint", async () => {
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { data: { id: 123 } } });

    await expect(createOfficialProduct({
      sku: "QA-SLM-001",
      name: "QA Product",
      productCategoryId: 5,
      uomId: 2,
      brandCode: "UMUM",
      sellPrice: 100000,
      costPrice: 0,
      description: "QA"
    })).resolves.toMatchObject({ success: true, data: 123 });

    expect(mocks.anikaRequest).toHaveBeenCalledWith("/products", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"product_category_id\":5")
    }));
    const payload = JSON.parse(mocks.anikaRequest.mock.calls[0][1].body);
    expect(payload).toMatchObject({ sku: "QA-SLM-001", name: "QA Product", kode_merk: "UMUM", uom_id: 2, sell_price: 100000, is_active: true });
  });

  it("finds an existing ERP product by exact SKU", async () => {
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { data: [{ id: 88, sku: "SKU-EXACT", name: "Exact" }, { id: 89, sku: "SKU-EXACT-OTHER", name: "Other" }] } });

    await expect(findProductIdBySku("SKU-EXACT")).resolves.toMatchObject({ success: true, data: 88 });

    expect(mocks.anikaRequest).toHaveBeenCalledWith("/products?sku=SKU-EXACT&per_page=100&page=1");
  });

  it("does not synthesize local fallback stocks when ERP payload shape is invalid", async () => {
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { unexpected: true } });

    await expect(listStocks()).resolves.toMatchObject({
      success: false,
      code: "ERP_SCHEMA",
      message: "Format data stok dari ERP tidak dikenali."
    });
  });

  it("paginates and filters internal product table items safely", () => {
    const items = Array.from({ length: 120 }, (_, index) => ({
      id: `P-${index + 1}`,
      code: `BRG-${index + 1}`,
      name: index === 51 ? "Produk Khusus" : `Produk ${index + 1}`,
      category: "Aksesoris",
      sellingPrice: 1000,
      minimumStock: 0,
      isActive: true,
      updatedAt: "2026-06-30T00:00:00.000Z"
    }));

    expect(paginateProductItems(items, { page: 2, pageSize: 50 })).toMatchObject({
      data: expect.arrayContaining([expect.objectContaining({ code: "BRG-51" })]),
      meta: { page: 2, pageSize: 50, total: 120, totalPages: 3 }
    });
    expect(paginateProductItems(items, { page: 1, pageSize: 500 }).meta.pageSize).toBe(100);
    expect(paginateProductItems(items, { keyword: "khusus" })).toMatchObject({
      data: [expect.objectContaining({ name: "Produk Khusus" })],
      meta: expect.objectContaining({ total: 1 })
    });
  });
});
