import { listBalances, listLocations } from "@/lib/inventory/service";
import { hasRealName } from "@/lib/inventory/math";

/**
 * Laporan stok dari inventory SLM, sama dengan halaman Stok Gudang & Toko.
 * Habis = qty ≤ 0; Menipis = ≤ 1 koli (atau ≤ minimum stok bila isi per koli kosong).
 */
export type StockReportFilter = {
  /** Nama atau kode lokasi gudang/toko. */
  warehouse?: string;
  /** WAREHOUSE = gudang, STORE = toko; kosong = semua lokasi. */
  locationType?: "WAREHOUSE" | "STORE";
  productKeyword?: string;
  productId?: string;
  sku?: string;
  status?: "all" | "safe" | "warning" | "out_of_stock";
};

export type StockReportItem = {
  productId: string;
  sku: string;
  productName: string;
  /** false bila nama barang di master masih sama dengan kodenya. */
  hasName?: boolean;
  category?: string | null;
  warehouse: string;
  warehouseCode?: string;
  locationType?: "WAREHOUSE" | "STORE";
  rack: string;
  quantity: number;
  unit: string;
  unitsPerKoli?: number | null;
  koliText?: string;
  minStock: number;
  costPrice: number;
  sellPrice: number;
  totalCostValuation: number;
  totalSellValuation: number;
  status: "safe" | "warning" | "out_of_stock";
};

export type StockReportResult = {
  items: StockReportItem[];
  warehouses: string[];
  summary: {
    totalItems: number;
    totalQuantity: number;
    /** Total qty per satuan (Lusin, Pack, …): satuan berbeda tidak dijumlah jadi satu angka. */
    unitTotals: { unit: string; quantity: number }[];
    totalCostValuation: number;
    totalSellValuation: number;
    warningCount: number;
    outOfStockCount: number;
    safeCount: number;
  };
  filter: StockReportFilter;
  generatedAt: string;
};

export function stockStatus(quantity: number, unitsPerKoli: number | null | undefined, minStock: number): StockReportItem["status"] {
  if (quantity <= 0) return "out_of_stock";
  if (unitsPerKoli && unitsPerKoli > 0 ? quantity <= unitsPerKoli : minStock > 0 && quantity <= minStock) return "warning";
  return "safe";
}

/** Urutan sama dengan halaman stok: paling sedikit (dalam koli) di atas, stok 0 paling bawah. */
export function compareStockItems(a: StockReportItem, b: StockReportItem) {
  const zeroA = a.quantity <= 0 ? 1 : 0;
  const zeroB = b.quantity <= 0 ? 1 : 0;
  if (zeroA !== zeroB) return zeroA - zeroB;
  const koliA = a.quantity / (a.unitsPerKoli || 1);
  const koliB = b.quantity / (b.unitsPerKoli || 1);
  if (koliA !== koliB) return koliA - koliB;
  return a.productName.localeCompare(b.productName) || a.warehouse.localeCompare(b.warehouse);
}

export async function getStockInventoryReport(filter: StockReportFilter = {}): Promise<StockReportResult> {
  const [locations, balances] = await Promise.all([
    listLocations({ type: filter.locationType }),
    listBalances({
      locationType: filter.locationType,
      productId: filter.productId,
      sku: filter.sku || undefined,
      keyword: filter.productKeyword || undefined,
      includeZero: true,
      all: true
    })
  ]);

  const wanted = filter.warehouse?.trim().toLowerCase();
  const items: StockReportItem[] = [];
  for (const row of balances.data) {
    if (wanted && row.locationName.toLowerCase() !== wanted && row.locationCode.toLowerCase() !== wanted) continue;
    const status = stockStatus(row.quantity, row.unitsPerKoli, row.minimumStock);
    if (filter.status && filter.status !== "all" && filter.status !== status) continue;
    items.push({
      productId: row.productId,
      sku: row.sku,
      productName: row.productName,
      hasName: hasRealName(row.productName, row.sku),
      category: row.category,
      warehouse: row.locationName,
      warehouseCode: row.locationCode,
      locationType: row.locationType,
      rack: "-",
      quantity: row.quantity,
      unit: row.unit,
      unitsPerKoli: row.unitsPerKoli,
      koliText: row.koliText,
      minStock: row.minimumStock,
      costPrice: row.costPrice,
      sellPrice: row.sellingPrice,
      totalCostValuation: Math.round(row.quantity * row.costPrice * 100) / 100,
      totalSellValuation: Math.round(row.quantity * row.sellingPrice * 100) / 100,
      status
    });
  }
  items.sort(compareStockItems);

  const sum = (fn: (i: StockReportItem) => number) => items.reduce((s, i) => s + fn(i), 0);
  return {
    items,
    warehouses: Array.from(new Set(locations.map((l) => l.name))),
    summary: {
      totalItems: items.length,
      totalQuantity: sum((i) => i.quantity),
      unitTotals: Array.from(items.reduce((m, i) => m.set(i.unit, (m.get(i.unit) ?? 0) + i.quantity), new Map<string, number>()))
        .map(([unit, quantity]) => ({ unit, quantity: Math.round(quantity * 100) / 100 }))
        .filter((u) => u.quantity !== 0)
        .sort((a, b) => b.quantity - a.quantity),
      totalCostValuation: sum((i) => i.totalCostValuation),
      totalSellValuation: sum((i) => i.totalSellValuation),
      warningCount: items.filter((i) => i.status === "warning").length,
      outOfStockCount: items.filter((i) => i.status === "out_of_stock").length,
      safeCount: items.filter((i) => i.status === "safe").length
    },
    filter,
    generatedAt: new Date().toISOString()
  };
}
