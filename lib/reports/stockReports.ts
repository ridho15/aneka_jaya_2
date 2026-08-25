import { listStocks } from "@/lib/api/stocks";
import { listProducts } from "@/lib/api/products";
import type { StockItem } from "@/lib/types/stock";
import type { Product } from "@/lib/types/product";

export type StockReportFilter = {
  warehouse?: string;
  productKeyword?: string;
  productId?: string;
  sku?: string;
  status?: "all" | "safe" | "warning" | "out_of_stock";
};

export type StockReportItem = {
  productId: string;
  sku: string;
  productName: string;
  warehouse: string;
  rack: string;
  quantity: number;
  unit: string;
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
    totalCostValuation: number;
    totalSellValuation: number;
    warningCount: number;
    outOfStockCount: number;
    safeCount: number;
  };
  filter: StockReportFilter;
  generatedAt: string;
};

export async function getStockInventoryReport(
  filter: StockReportFilter = {},
): Promise<StockReportResult> {
  const [stocksResponse, productsResponse] = await Promise.all([
    listStocks({
      pageSize: 100,
      maxPages: 10,
      keyword: filter.productKeyword,
      productId: filter.productId,
      sku: filter.sku,
      warehouse: filter.warehouse,
    }),
    listProducts(),
  ]);

  const stockRows: StockItem[] = stocksResponse.success ? stocksResponse.data : [];
  const productRows: Product[] = productsResponse.success ? productsResponse.data : [];

  // Map product prices by sku or id
  const productPriceMap = new Map<string, { costPrice: number; sellPrice: number; category?: string }>();
  for (const prod of productRows) {
    const costPrice = Number(prod.costPrice || 0);
    const sellPrice = Number(prod.sellingPrice || 0);
    if (prod.code) productPriceMap.set(prod.code.toLowerCase(), { costPrice, sellPrice, category: prod.category ?? undefined });
    if (prod.id) productPriceMap.set(prod.id.toLowerCase(), { costPrice, sellPrice, category: prod.category ?? undefined });
    if (prod.productId) productPriceMap.set(prod.productId.toLowerCase(), { costPrice, sellPrice, category: prod.category ?? undefined });
  }

  const warehouseSet = new Set<string>();
  const items: StockReportItem[] = [];

  for (const stock of stockRows) {
    const warehouse = stock.warehouse || "Gudang Utama";
    warehouseSet.add(warehouse);

    const qty = Number(stock.quantity || 0);
    const minStock = Number(stock.minimumStock || 0);

    let status: "safe" | "warning" | "out_of_stock" = "safe";
    if (qty <= 0) {
      status = "out_of_stock";
    } else if (minStock > 0 && qty <= minStock) {
      status = "warning";
    }

    if (filter.status && filter.status !== "all" && filter.status !== status) {
      continue;
    }

    const priceInfo =
      productPriceMap.get(stock.productCode.toLowerCase()) ||
      (stock.productId ? productPriceMap.get(stock.productId.toLowerCase()) : undefined) || {
        costPrice: 0,
        sellPrice: 0,
      };

    const costPrice = priceInfo.costPrice;
    const sellPrice = priceInfo.sellPrice;
    const totalCostValuation = qty * costPrice;
    const totalSellValuation = qty * sellPrice;

    items.push({
      productId: stock.productId || "",
      sku: stock.productCode,
      productName: stock.productName,
      warehouse,
      rack: stock.rack || "-",
      quantity: qty,
      unit: stock.unit || "Pcs",
      minStock,
      costPrice,
      sellPrice,
      totalCostValuation,
      totalSellValuation,
      status,
    });
  }

  // Sort by warning/out_of_stock first, then product name
  items.sort((a, b) => {
    if (a.status === "out_of_stock" && b.status !== "out_of_stock") return -1;
    if (b.status === "out_of_stock" && a.status !== "out_of_stock") return 1;
    if (a.status === "warning" && b.status === "safe") return -1;
    if (b.status === "warning" && a.status === "safe") return 1;
    return a.productName.localeCompare(b.productName);
  });

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalCostValuation = items.reduce((sum, item) => sum + item.totalCostValuation, 0);
  const totalSellValuation = items.reduce((sum, item) => sum + item.totalSellValuation, 0);
  const warningCount = items.filter((item) => item.status === "warning").length;
  const outOfStockCount = items.filter((item) => item.status === "out_of_stock").length;
  const safeCount = items.filter((item) => item.status === "safe").length;

  return {
    items,
    warehouses: Array.from(warehouseSet).sort(),
    summary: {
      totalItems: items.length,
      totalQuantity,
      totalCostValuation,
      totalSellValuation,
      warningCount,
      outOfStockCount,
      safeCount,
    },
    filter,
    generatedAt: new Date().toISOString(),
  };
}
