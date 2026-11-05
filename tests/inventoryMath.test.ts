import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/pagination", () => ({ listErpPaginated: vi.fn() }));
import { aggregateErpStocks } from "@/lib/inventory/erpImport";
import { applyDelta } from "@/lib/inventory/math";
import { adjustmentSchema, opnameSchema, transferSchema } from "@/lib/inventory/validation";

describe("inventory math", () => {
  it("menghitung harga pokok rata-rata saat barang masuk", () => {
    expect(applyDelta({ quantity: 10, avgCost: 1000 }, 10, 2000)).toEqual({ quantity: 20, avgCost: 1500 });
  });
  it("barang keluar tidak mengubah avgCost", () => {
    expect(applyDelta({ quantity: 10, avgCost: 1000 }, -4)).toEqual({ quantity: 6, avgCost: 1000 });
  });
  it("saldo negatif tidak ikut menghitung rata-rata", () => {
    expect(applyDelta({ quantity: -5, avgCost: 0 }, 10, 300)).toEqual({ quantity: 5, avgCost: 300 });
  });
});

describe("inventory validation", () => {
  it("menolak transfer ke lokasi yang sama", () => {
    const parsed = transferSchema.safeParse({ fromLocationId: "a", toLocationId: "a", items: [{ sku: "X", quantity: 1 }] });
    expect(parsed.success).toBe(false);
  });
  it("adjustment menolak qty 0 dan menerima qty negatif", () => {
    expect(adjustmentSchema.safeParse({ locationId: "a", reason: "rusak", items: [{ sku: "X", quantity: 0 }] }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ locationId: "a", reason: "rusak", items: [{ sku: "X", quantity: -2 }] }).success).toBe(true);
  });
  it("opname mewajibkan referensi produk dan qty fisik >= 0", () => {
    expect(opnameSchema.safeParse({ locationId: "a", items: [{ countedQty: 3 }] }).success).toBe(false);
    expect(opnameSchema.safeParse({ locationId: "a", items: [{ sku: "X", countedQty: -1 }] }).success).toBe(false);
    expect(opnameSchema.safeParse({ locationId: "a", items: [{ erpProductId: 12, countedQty: 0 }] }).success).toBe(true);
  });
});

describe("aggregateErpStocks", () => {
  it("menjumlahkan stok per rak menjadi per gudang dan melewati baris tanpa SKU", () => {
    const base = { productName: "Kabel", unit: "PCS", quantity: 0 } as const;
    const result = aggregateErpStocks([
      { ...base, id: "1", productId: "10", productCode: "KBL", warehouse: "Toko", warehouseId: "1", quantity: 3 },
      { ...base, id: "2", productId: "10", productCode: "KBL", warehouse: "Toko", warehouseId: "1", quantity: 4 },
      { ...base, id: "3", productId: "10", productCode: "KBL", warehouse: "Gudang", warehouseId: "2", quantity: 5 },
      { ...base, id: "4", productCode: "", warehouse: "Toko", warehouseId: "1", quantity: 1 }
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.find((r) => r.erpWarehouseId === 1)?.quantity).toBe(7);
    expect(result.rows[0].erpProductId).toBe(10);
    expect(result.skipped).toHaveLength(1);
  });
});
