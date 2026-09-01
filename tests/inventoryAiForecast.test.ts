import { describe, expect, it, vi, beforeEach } from "vitest";
import { getInventoryAiForecast } from "@/lib/ai/inventoryForecast";

vi.mock("@/lib/reports/stockReports", () => ({
  getStockInventoryReport: vi.fn().mockResolvedValue({
    items: [
      {
        productId: "p-1",
        sku: "SKU-CRITICAL",
        productName: "Barang Cepat Habis",
        warehouse: "Gudang Utama",
        rack: "A1",
        quantity: 2,
        unit: "Pcs",
        minStock: 10,
        costPrice: 50000,
        sellPrice: 70000,
        totalCostValuation: 100000,
        totalSellValuation: 140000,
        status: "warning"
      },
      {
        productId: "p-2",
        sku: "SKU-DEAD",
        productName: "Barang Mati Tidak Bergerak",
        warehouse: "Gudang Cadangan",
        rack: "B2",
        quantity: 20,
        unit: "Dus",
        minStock: 2,
        costPrice: 100000,
        sellPrice: 150000,
        totalCostValuation: 2000000,
        totalSellValuation: 3000000,
        status: "safe"
      }
    ],
    warehouses: ["Gudang Utama", "Gudang Cadangan"],
    summary: {
      totalItems: 2,
      totalQuantity: 22,
      totalCostValuation: 2100000,
      totalSellValuation: 3140000,
      warningCount: 1,
      outOfStockCount: 0,
      safeCount: 1
    },
    filter: {},
    generatedAt: new Date().toISOString()
  })
}));

vi.mock("@/lib/sales/store", () => ({
  listSalesRecords: vi.fn().mockResolvedValue([
    {
      id: "sale-1",
      approvalStatus: "approved",
      saleDate: new Date().toISOString().split("T")[0],
      items: [
        {
          productId: "p-1",
          sku: "SKU-CRITICAL",
          productNameSnapshot: "Barang Cepat Habis",
          quantity: 15,
          unitPrice: 70000
        }
      ]
    }
  ])
}));

describe("AI Inventory & Demand Forecasting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes reorder recommendations and identifies dead stock accurately", async () => {
    const result = await getInventoryAiForecast({ forceRefresh: true });

    expect(result).toBeDefined();
    expect(result.summary.totalItemsAnalyzed).toBeGreaterThanOrEqual(1);
    expect(result.reorderRecommendations.length).toBeGreaterThanOrEqual(1);

    const criticalItem = result.reorderRecommendations.find((r) => r.sku === "SKU-CRITICAL");
    expect(criticalItem).toBeDefined();
    expect(criticalItem?.urgency).toBe("CRITICAL");
    expect(criticalItem?.recommendedReorderQty).toBeGreaterThan(0);

    const deadItem = result.deadStockOptimizations.find((d) => d.sku === "SKU-DEAD");
    expect(deadItem).toBeDefined();
    expect(deadItem?.tiedUpCapital).toBe(2000000);
    expect(deadItem?.discountRecommendationPercent).toBeGreaterThan(0);

    expect(result.supplierPoDraft).toContain("PO");
    expect(result.executiveSummary).toBeTruthy();
  });
});
