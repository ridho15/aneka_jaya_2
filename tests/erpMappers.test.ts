import { describe, expect, it, vi } from "vitest";
import { normalizeProductCode, toProduct, toProductListItem, toStockItem } from "@/lib/api/erpMappers";

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

  it("reads live ERP product nested prices and flags", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const product = toProduct({
      id: 88,
      sku: "ERP-88",
      name: "Produk Live ERP",
      category: { id: 4, name: "Aksesoris" },
      uom: { id: 9, abbreviation: "PCS" },
      prices: {
        sell_price: "175000",
        cost_price: 125000
      },
      flags: {
        is_active: false
      }
    });

    expect(product.productId).toBe("88");
    expect(product.sellingPrice).toBe(175000);
    expect(product.costPrice).toBe(125000);
    expect(product.isActive).toBe(false);
    expect(product.unit).toBe("PCS");
    expect(product.dataQualityWarnings).toEqual(expect.arrayContaining(["minimum stock"]));
    expect(product.dataQualityWarnings).not.toEqual(expect.arrayContaining(["harga jual", "harga modal", "status aktif", "satuan"]));
    warn.mockRestore();
  });

  it("keeps UOM fields in the lightweight product list response", () => {
    const product = toProduct({
      id: 99,
      sku: "ERP-UOM-99",
      name: "Produk dengan UOM",
      category: { id: 4, name: "Aksesoris" },
      uom: { id: 12, abbreviation: "BOX" },
      prices: { sell_price: 10000, cost_price: 5000 },
      flags: { is_active: true }
    });

    expect(toProductListItem(product)).toMatchObject({
      unit: "BOX",
      uomId: 12
    });
  });

  it("reads latest ERP product stock summary and stock breakdown", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const product = toProduct({
      id: 91,
      sku: "ERP-91",
      name: "Produk Summary ERP",
      category: { id: 4, name: "Aksesoris" },
      uom: { id: 9, abbreviation: "PCS" },
      prices: { sell_price: 99000, cost_price: 70000 },
      flags: { is_active: true },
      stock_summary: {
        qty_available: 0,
        qty_reserved: 2,
        free_qty: 0,
        qty_on_hand: 2,
        qty_min: 5,
        warehouse_count: 2,
        rak_count: 3,
        is_low_stock: true
      },
      stock_breakdown: [{
        id: 701,
        product_id: 91,
        product_sku: "ERP-91",
        product_name: "Produk Summary ERP",
        warehouse_name: "Gudang Utama",
        rak_name: "Rak A",
        qty_available: 0,
        qty_reserved: 2,
        free_qty: 0,
        qty_on_hand: 2,
        qty_min: 5,
        is_low_stock: true,
        ready: false,
        uom: { abbreviation: "PCS" }
      }]
    });

    expect(product.minimumStock).toBe(5);
    expect(product.stockSummary).toMatchObject({
      quantity: 0,
      reservedQuantity: 2,
      freeQuantity: 0,
      onHandQuantity: 2,
      minimumStock: 5,
      warehouseCount: 2,
      rackCount: 3,
      isLowStock: true
    });
    expect(product.stockBreakdown?.[0]).toMatchObject({
      productId: "91",
      productCode: "ERP-91",
      quantity: 0,
      reservedQuantity: 2,
      freeQuantity: 0,
      onHandQuantity: 2,
      minimumStock: 5,
      warehouse: "Gudang Utama",
      rack: "Rak A",
      isLowStock: true,
      ready: false
    });
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

  it("reads live-like stock product id, nested product, current quantity, warehouse, and rack", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const stock = toStockItem({
      id: 501,
      product_id: 88,
      product: { id: 88, sku: "ERP-88", name: "Produk Live ERP", uom: { abbreviation: "PCS" } },
      warehouse: { id: 2, name: "Gudang Utama" },
      rak: { id: 7, name: "Rak A1" },
      current_qty: "14"
    });

    expect(stock).toMatchObject({
      id: "501",
      productId: "88",
      productCode: "ERP-88",
      productName: "Produk Live ERP",
      warehouse: "Gudang Utama",
      rack: "Rak A1",
      quantity: 14,
      unit: "PCS"
    });
    expect(stock.dataQualityWarnings).toEqual(expect.arrayContaining(["minimum stock"]));
    expect(stock.dataQualityWarnings).not.toEqual(expect.arrayContaining(["quantity", "satuan", "gudang"]));
    warn.mockRestore();
  });

  it("reads latest ERP StockResource fields and keeps zero quantities valid", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const stock = toStockItem({
      id: 801,
      product_id: 91,
      product_sku: "ERP-91",
      product_name: "Produk StockResource",
      uom: { abbreviation: "PCS" },
      warehouse_id: 3,
      warehouse_code: "GDG",
      warehouse_name: "Gudang Utama",
      rak_id: 4,
      rak_code: "A",
      rak_name: "Rak A",
      qty_available: 0,
      qty_reserved: 1,
      free_qty: 0,
      qty_on_hand: 1,
      qty_min: 5,
      is_low_stock: true,
      ready: false
    });

    expect(stock).toMatchObject({
      id: "801",
      productId: "91",
      productCode: "ERP-91",
      productName: "Produk StockResource",
      warehouseId: "3",
      warehouseCode: "GDG",
      warehouse: "Gudang Utama",
      rackId: "4",
      rackCode: "A",
      rack: "Rak A",
      quantity: 0,
      reservedQuantity: 1,
      freeQuantity: 0,
      onHandQuantity: 1,
      minimumStock: 5,
      isLowStock: true,
      ready: false,
      unit: "PCS"
    });
    expect(stock.dataQualityWarnings).toEqual([]);
    warn.mockRestore();
  });
});
