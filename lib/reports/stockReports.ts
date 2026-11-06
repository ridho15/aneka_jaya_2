import { prisma } from "@/lib/db/prisma";
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
  /** Barang titipan pihak lain: bukan aset SLM, tidak ikut nilai stok. */
  consignment?: boolean;
  consignorName?: string | null;
};

export type StockReportResult = {
  items: StockReportItem[];
  warehouses: string[];
  summary: {
    totalItems: number;
    totalQuantity: number;
    /** Total qty per satuan (Lusin, Pack, …): satuan berbeda tidak dijumlah jadi satu angka. */
    unitTotals: { unit: string; quantity: number }[];
    /** Nilai stok milik SLM (barang titipan tidak termasuk). */
    totalCostValuation: number;
    totalSellValuation: number;
    /** Nilai barang titipan pihak lain menurut modal titipan. */
    consignmentCostValuation: number;
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

/** 0 = ada stok di toko, 1 = hanya di gudang, 2 = tidak ada stok sama sekali (dihitung per barang dari semua baris laporan). */
export function availabilityGroups(items: Pick<StockReportItem, "productId" | "sku" | "quantity" | "locationType">[]) {
  const groups = new Map<string, number>();
  for (const item of items) {
    const key = item.productId ?? item.sku;
    if (!groups.has(key)) groups.set(key, 2);
    if (item.quantity > 0) groups.set(key, Math.min(groups.get(key)!, item.locationType === "WAREHOUSE" ? 1 : 0));
  }
  return groups;
}

const STATUS_ORDER: Record<StockReportItem["status"], number> = { warning: 0, safe: 1, out_of_stock: 2 };

/**
 * Urutan laporan: barang yang ada di toko, lalu yang hanya di gudang, lalu yang stoknya kosong.
 * Di tiap kelompok yang menipis di atas, lalu stok paling sedikit (dalam koli).
 */
export function compareStockItems(a: StockReportItem, b: StockReportItem, groups: Map<string, number> = new Map()) {
  const groupA = groups.get(a.productId ?? a.sku) ?? (a.quantity > 0 ? 0 : 2);
  const groupB = groups.get(b.productId ?? b.sku) ?? (b.quantity > 0 ? 0 : 2);
  if (groupA !== groupB) return groupA - groupB;
  if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  const koliA = a.quantity / (a.unitsPerKoli || 1);
  const koliB = b.quantity / (b.unitsPerKoli || 1);
  if (koliA !== koliB) return koliA - koliB;
  return a.productName.localeCompare(b.productName) || a.warehouse.localeCompare(b.warehouse);
}

export async function getStockInventoryReport(filter: StockReportFilter = {}): Promise<StockReportResult> {
  const [locations, balances, consignmentRows] = await Promise.all([
    listLocations({ type: filter.locationType }),
    listBalances({
      locationType: filter.locationType,
      productId: filter.productId,
      sku: filter.sku || undefined,
      keyword: filter.productKeyword || undefined,
      includeZero: true,
      all: true
    }),
    typeof prisma?.inventoryProduct?.findMany === "function"
      ? prisma.inventoryProduct.findMany({ where: { ownership: "CONSIGNMENT" }, select: { id: true, consignorName: true } }).catch(() => [])
      : Promise.resolve([] as Array<{ id: string; consignorName: string | null }>)
  ]);
  const consignors = new Map(consignmentRows.map((r) => [r.id, r.consignorName]));

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
      status,
      consignment: consignors.has(row.productId),
      consignorName: consignors.get(row.productId) ?? null
    });
  }
  const groups = availabilityGroups(items);
  items.sort((a, b) => compareStockItems(a, b, groups));

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
      totalCostValuation: sum((i) => (i.consignment ? 0 : i.totalCostValuation)),
      totalSellValuation: sum((i) => (i.consignment ? 0 : i.totalSellValuation)),
      consignmentCostValuation: sum((i) => (i.consignment ? i.totalCostValuation : 0)),
      warningCount: items.filter((i) => i.status === "warning").length,
      outOfStockCount: items.filter((i) => i.status === "out_of_stock").length,
      safeCount: items.filter((i) => i.status === "safe").length
    },
    filter,
    generatedAt: new Date().toISOString()
  };
}
