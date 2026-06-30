import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  anikaRequest: vi.fn()
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/anikaClient", () => ({
  anikaRequest: mocks.anikaRequest
}));

import { listProducts, paginateProductItems } from "@/lib/api/products";
import { listStocks } from "@/lib/api/stocks";

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

  it("does not synthesize local fallback products when ERP payload shape is invalid", async () => {
    mocks.anikaRequest.mockResolvedValue({ success: true, data: { unexpected: true } });

    await expect(listProducts()).resolves.toMatchObject({
      success: false,
      code: "ERP_SCHEMA",
      message: "Format data produk dari ERP tidak dikenali."
    });
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
