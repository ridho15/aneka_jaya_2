import { describe, expect, it } from "vitest";
import { buildProductOptions, isSalesItemReady, mergeErpProductResults } from "@/components/forms/PenjualanForm";
import type { Product } from "@/lib/types/product";
import type { StockItem } from "@/lib/types/stock";

describe("Penjualan product search options", () => {
  it("combines ERP products with stock rows by normalized product code", () => {
    const products: Product[] = [{
      id: "P-1",
      code: "ABC-1",
      name: "Produk ABC",
      category: "Aksesoris",
      unit: null,
      sellingPrice: 15000,
      costPrice: null,
      minimumStock: 2,
      isActive: true,
      updatedAt: "2026-06-30T00:00:00.000Z"
    }];
    const stocks: StockItem[] = [
      { id: "S-1", productCode: " abc-1 ", productName: "Produk ABC", warehouse: "Toko", quantity: 3, minimumStock: 1, unit: "PCS" },
      { id: "S-2", productCode: "ABC-1", productName: "Produk ABC", warehouse: "Gudang", quantity: 4, minimumStock: 1, unit: "PCS" }
    ];

    expect(buildProductOptions(products, stocks)).toEqual([
      expect.objectContaining({
        product: expect.objectContaining({ code: "ABC-1" }),
        quantity: 7,
        minimumStock: 2,
        unit: "PCS",
        warehouses: ["Toko", "Gudang"],
        warnings: []
      })
    ]);
  });

  it("marks missing stock and selling price as ERP data warnings", () => {
    const products: Product[] = [{
      id: "P-2",
      code: "P-2",
      name: "Produk Parsial",
      category: null,
      unit: null,
      sellingPrice: null,
      costPrice: null,
      minimumStock: null,
      isActive: null,
      updatedAt: "2026-06-30T00:00:00.000Z"
    }];

    const [option] = buildProductOptions(products, []);

    expect(option.quantity).toBeNull();
    expect(option.warehouses).toEqual([]);
    expect(option.warnings).toEqual(expect.arrayContaining(["stok ERP", "qty ERP", "harga jual"]));
  });

  it("retains an earlier ERP selection when a later search returns another product", () => {
    const productA: Product = {
      id: "11", productId: "11", code: "ERP-A", name: "Produk A", category: null, unit: "PCS",
      sellingPrice: 10000, costPrice: null, minimumStock: null, isActive: true, updatedAt: "2026-07-01T00:00:00.000Z"
    };
    const productB: Product = {
      id: "22", productId: "22", code: "ERP-B", name: "Produk B", category: null, unit: "PCS",
      sellingPrice: 20000, costPrice: null, minimumStock: null, isActive: true, updatedAt: "2026-07-01T00:00:00.000Z"
    };

    expect(mergeErpProductResults([productA], [productB]).map((product) => product.code)).toEqual(["ERP-A", "ERP-B"]);
    expect(mergeErpProductResults([productA], [{ ...productA, name: "Produk A terbaru" }])).toEqual([
      expect.objectContaining({ productId: "11", name: "Produk A terbaru" })
    ]);
  });

  it("validates ERP items by their stable product id instead of transient search results", () => {
    expect(isSalesItemReady({
      productRef: "ERP-A", productId: "11", productInputMode: "erp", quantity: 1, unitPrice: 10000, discount: 0
    })).toBe(true);
    expect(isSalesItemReady({
      productRef: "ERP-A", productInputMode: "erp", quantity: 1, unitPrice: 10000, discount: 0
    })).toBe(false);
  });
});
