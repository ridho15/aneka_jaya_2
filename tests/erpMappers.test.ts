import { describe, expect, it, vi } from "vitest";
import { normalizeProductCode, toProduct, toStockItem } from "@/lib/api/erpMappers";

describe("ERP product and stock mappers", () => {
  it("normalizes object-backed product fields without rendering [object Object]", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const product = toProduct({
      id: 7,
      sku: " Kcr12881085 ",
      name: "Kcr 1288-1085",
      product_category: { id: 2, name: "Aksesoris" },
      uom: { id: 3, name: "PCS" },
      brand: { code: "BR-1", name: "Aneka" },
      warehouse: { name: "Toko" },
      sell_price: 0,
      cost_price: "12500",
      minimum_stock: 0,
      is_active: "0",
      updated_at: "2026-06-29T10:00:00.000Z"
    });

    expect(product).toMatchObject({
      id: "7",
      code: "Kcr12881085",
      category: "Aksesoris",
      unit: "PCS",
      brand: "Aneka",
      warehouse: "Toko",
      sellingPrice: 0,
      costPrice: 12500,
      minimumStock: 0,
      isActive: false,
      productCategoryId: 2,
      uomId: 3
    });
    expect(product.category).not.toBe("[object Object]");
    expect(product.dataQualityWarnings).toEqual([]);
    warn.mockRestore();
  });

  it("keeps missing or invalid product values nullable instead of fallback zero or active", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const product = toProduct({
      code: "P-NULL",
      name: "Produk Parsial",
      category: { description: "tanpa name" },
      sell_price: "bukan angka",
      is_active: "maybe"
    });

    expect(product.category).toBeNull();
    expect(product.unit).toBeNull();
    expect(product.sellingPrice).toBeNull();
    expect(product.costPrice).toBeNull();
    expect(product.minimumStock).toBeNull();
    expect(product.isActive).toBeNull();
    expect(product.dataQualityWarnings).toEqual(expect.arrayContaining(["kategori", "satuan", "harga jual", "harga modal", "minimum stock", "status aktif"]));
    warn.mockRestore();
  });

  it("accepts common ERP aliases for price, minimum stock, and active status", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const product = toProduct({
      id: "P-ALIAS",
      code: "P-ALIAS",
      name: "Produk Alias",
      category: "Lain - Lain",
      unit: "PCS",
      sale_price: "25000",
      cost_price: 10000,
      minimum_qty: "3",
      status: "active"
    });

    expect(product.sellingPrice).toBe(25000);
    expect(product.minimumStock).toBe(3);
    expect(product.isActive).toBe(true);
    expect(product.dataQualityWarnings).toEqual([]);
    warn.mockRestore();
  });

  it("normalizes stock object fields and preserves nullable invalid numbers", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const stock = toStockItem({
      id: "S-1",
      product: { sku: " abc-1 ", name: "Produk ABC", uom: { name: "BOX" }, minimum_stock: 4 },
      warehouse: { name: "Gudang A" },
      quantity: "12"
    });
    const invalidStock = toStockItem({
      product_code: "ABC-2",
      product_name: "Produk Invalid",
      quantity: {},
      minimum_stock: "rusak",
      unit: { name: "PCS" }
    });

    expect(stock).toMatchObject({
      productCode: "abc-1",
      productName: "Produk ABC",
      warehouse: "Gudang A",
      quantity: 12,
      minimumStock: 4,
      unit: "BOX"
    });
    expect(invalidStock.quantity).toBeNull();
    expect(invalidStock.minimumStock).toBeNull();
    expect(invalidStock.dataQualityWarnings).toEqual(expect.arrayContaining(["quantity", "minimum stock", "gudang"]));
    warn.mockRestore();
  });

  it("normalizes product codes for trim and case-insensitive joins", () => {
    expect(normalizeProductCode(" SKU-001 ")).toBe("sku-001");
    expect(normalizeProductCode({ sku: "SKU-001" })).toBe("sku-001");
  });

  it("accepts common ERP stock aliases for product code and quantity", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const stock = toStockItem({
      item_code: "SKU-002",
      product_name: "Produk Stok Alias",
      warehouse_name: "Toko",
      available_qty: "9",
      min_qty: "2",
      uom: "PCS"
    });

    expect(stock.productCode).toBe("SKU-002");
    expect(stock.quantity).toBe(9);
    expect(stock.minimumStock).toBe(2);
    expect(stock.dataQualityWarnings).toEqual([]);
    warn.mockRestore();
  });
});
