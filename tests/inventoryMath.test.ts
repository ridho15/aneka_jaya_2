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

describe("koli", async () => {
  const { qtyFromKoli, splitKoli, formatKoli } = await import("@/lib/inventory/math");
  it("menghitung qty dari koli × isi + lepas", () => {
    expect(qtyFromKoli({ koli: 32 }, 40)).toBe(1280);
    expect(qtyFromKoli({ koli: 2, loose: 5 }, 60)).toBe(125);
    expect(qtyFromKoli({ quantity: 7 }, 60)).toBe(7);
    expect(qtyFromKoli({ loose: 9 }, null)).toBe(9);
    expect(qtyFromKoli({ koli: 1 }, null)).toBeNull();
    expect(qtyFromKoli({ koli: -1, loose: -2 }, 60)).toBe(-62);
  });
  it("memecah qty menjadi koli + lepas", () => {
    expect(splitKoli(1280, 40)).toEqual({ koli: 32, loose: 0 });
    expect(splitKoli(698, 60)).toEqual({ koli: 11, loose: 38 });
    expect(splitKoli(-62, 60)).toEqual({ koli: -1, loose: -2 });
    expect(splitKoli(10, null)).toBeNull();
    expect(formatKoli(698, 60, "Lusin")).toBe("11 koli + 38 Lusin");
    expect(formatKoli(20, 60, "Lusin")).toBe("20 Lusin");
    expect(formatKoli(1280, 40, "Box")).toBe("32 koli");
  });
});

describe("perbaikan review", async () => {
  const { qtyFromKoli } = await import("@/lib/inventory/math");
  const { opnameSchema } = await import("@/lib/inventory/validation");
  it("koli/lepas null atau 0 tidak menimpa qty langsung", () => {
    expect(qtyFromKoli({ quantity: 10, koli: null, loose: null }, 60)).toBe(10);
    expect(qtyFromKoli({ quantity: 10, koli: 0, loose: 0 }, 60)).toBe(10);
    const parsed = opnameSchema.parse({ locationId: "a", items: [{ sku: "A", countedQty: 10, koli: null, loose: null }] });
    expect(parsed.items[0]).toMatchObject({ countedQty: 10 });
    expect((parsed.items[0] as { koli?: number }).koli).toBeUndefined();
  });
});
