import { describe, expect, it } from "vitest";
import { buildProductOptions } from "@/components/forms/PenjualanForm";
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
});
