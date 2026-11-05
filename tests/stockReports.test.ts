import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/inventory/service", () => ({
  listLocations: vi.fn(),
  listBalances: vi.fn()
}));

import { getStockInventoryReport, stockStatus } from "@/lib/reports/stockReports";
import { listBalances, listLocations } from "@/lib/inventory/service";

const row = (over: Record<string, unknown>) => ({
  id: "b", productId: "p", sku: "SKU", productName: "Barang", unit: "Lusin", erpProductId: null,
  locationId: "l1", locationCode: "TK-PUSAT", locationName: "Toko Pusat", locationType: "STORE", erpWarehouseId: null,
  quantity: 0, avgCost: 0, stockValue: 0, minimumStock: 0, costPrice: 0, sellingPrice: 0, category: null, isLowStock: false,
  unitsPerKoli: null, koli: null, loose: null, koliText: "", updatedAt: "",
  ...over
});

describe("laporan stok (sumber inventory SLM)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listLocations).mockResolvedValue([{ name: "Toko Pusat" }, { name: "Gudang Pluit" }] as never);
  });

  it("status: habis ≤ 0, menipis ≤ 1 koli (atau ≤ minimum bila tanpa isi koli)", () => {
    expect(stockStatus(0, 60, 0)).toBe("out_of_stock");
    expect(stockStatus(60, 60, 0)).toBe("warning");
    expect(stockStatus(61, 60, 0)).toBe("safe");
    expect(stockStatus(3, null, 5)).toBe("warning");
    expect(stockStatus(3, null, 0)).toBe("safe");
  });

  it("valuasi = qty × modal, urut paling sedikit (koli) di atas, stok 0 paling bawah", async () => {
    vi.mocked(listBalances).mockResolvedValue({
      data: [
        row({ sku: "A", productName: "Banyak", quantity: 600, unitsPerKoli: 60, costPrice: 1000, sellingPrice: 1500, koliText: "10 koli" }),
        row({ sku: "Z", productName: "Kosong", quantity: 0, unitsPerKoli: 60 }),
        row({ sku: "B", productName: "Sedikit", quantity: 60, unitsPerKoli: 60, costPrice: 2000, koliText: "1 koli" })
      ],
      meta: { page: 1, pageSize: 5000, total: 3, totalPages: 1 }
    } as never);
    const r = await getStockInventoryReport({ locationType: "STORE" });
    expect(vi.mocked(listBalances).mock.calls[0][0]).toMatchObject({ locationType: "STORE", includeZero: true });
    expect(r.items.map((i) => i.sku)).toEqual(["B", "A", "Z"]);
    expect(r.items.map((i) => i.status)).toEqual(["warning", "safe", "out_of_stock"]);
    expect(r.summary.totalCostValuation).toBe(600 * 1000 + 60 * 2000);
    expect(r.summary.totalSellValuation).toBe(600 * 1500);
    expect(r.warehouses).toEqual(["Toko Pusat", "Gudang Pluit"]);
  });

  it("filter lokasi & status", async () => {
    vi.mocked(listBalances).mockResolvedValue({
      data: [row({ sku: "A", quantity: 10, locationName: "Toko Pusat" }), row({ sku: "B", quantity: 0, locationName: "Toko Cabang", locationCode: "TK-CAB" })],
      meta: { page: 1, pageSize: 5000, total: 2, totalPages: 1 }
    } as never);
    expect((await getStockInventoryReport({ warehouse: "TK-CAB" })).items.map((i) => i.sku)).toEqual(["B"]);
    expect((await getStockInventoryReport({ status: "out_of_stock" })).items.map((i) => i.sku)).toEqual(["B"]);
  });
});
