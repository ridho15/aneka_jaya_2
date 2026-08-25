import { describe, it, expect, vi, beforeEach } from "vitest";
import { getStockInventoryReport } from "@/lib/reports/stockReports";
import { listStocks } from "@/lib/api/stocks";
import { listProducts } from "@/lib/api/products";

vi.mock("@/lib/api/stocks", () => ({
  listStocks: vi.fn(),
}));

vi.mock("@/lib/api/products", () => ({
  listProducts: vi.fn(),
}));

describe("stock inventory report aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates stock valuations and warning alerts properly", async () => {
    vi.mocked(listStocks).mockResolvedValue({
      success: true,
      data: [
        {
          productId: "PROD-1",
          productCode: "BRG-001",
          productName: "Kain Katun",
          warehouse: "Gudang Utama",
          rack: "A-01",
          quantity: 20,
          unit: "Roll",
          minimumStock: 5,
        },
        {
          productId: "PROD-2",
          productCode: "BRG-002",
          productName: "Kain Sutra",
          warehouse: "Toko",
          rack: "B-02",
          quantity: 3,
          unit: "Meter",
          minimumStock: 10,
        },
        {
          productId: "PROD-3",
          productCode: "BRG-003",
          productName: "Benang Jahit",
          warehouse: "Gudang Utama",
          rack: "C-03",
          quantity: 0,
          unit: "Pcs",
          minimumStock: 5,
        },
      ] as any,
    });

    vi.mocked(listProducts).mockResolvedValue({
      success: true,
      data: [
        {
          id: "PROD-1",
          code: "BRG-001",
          name: "Kain Katun",
          costPrice: 80000,
          sellPrice: 100000,
        },
        {
          id: "PROD-2",
          code: "BRG-002",
          name: "Kain Sutra",
          costPrice: 150000,
          sellPrice: 200000,
        },
        {
          id: "PROD-3",
          code: "BRG-003",
          name: "Benang Jahit",
          costPrice: 5000,
          sellPrice: 8000,
        },
      ] as any,
    });

    const result = await getStockInventoryReport();

    expect(result.items).toHaveLength(3);

    // BRG-001: 20 qty > 5 min -> safe, cost valuation = 20 * 80000 = 1600000
    const brg1 = result.items.find((i) => i.sku === "BRG-001");
    expect(brg1?.status).toBe("safe");
    expect(brg1?.totalCostValuation).toBe(1600000);

    // BRG-002: 3 qty <= 10 min -> warning, cost valuation = 3 * 150000 = 450000
    const brg2 = result.items.find((i) => i.sku === "BRG-002");
    expect(brg2?.status).toBe("warning");
    expect(brg2?.totalCostValuation).toBe(450000);

    // BRG-003: 0 qty -> out_of_stock
    const brg3 = result.items.find((i) => i.sku === "BRG-003");
    expect(brg3?.status).toBe("out_of_stock");

    // Summary checks
    expect(result.summary.totalItems).toBe(3);
    expect(result.summary.totalQuantity).toBe(23);
    expect(result.summary.totalCostValuation).toBe(2050000);
    expect(result.summary.warningCount).toBe(1);
    expect(result.summary.outOfStockCount).toBe(1);
    expect(result.summary.safeCount).toBe(1);
  });

  it("filters stock report by warehouse and status", async () => {
    vi.mocked(listStocks).mockResolvedValue({
      success: true,
      data: [
        {
          productId: "PROD-1",
          productCode: "BRG-001",
          productName: "Kain Katun",
          warehouse: "Gudang Utama",
          quantity: 20,
          minimumStock: 5,
        },
        {
          productId: "PROD-2",
          productCode: "BRG-002",
          productName: "Kain Sutra",
          warehouse: "Toko",
          quantity: 2,
          minimumStock: 10,
        },
      ] as any,
    });

    vi.mocked(listProducts).mockResolvedValue({
      success: true,
      data: [],
    });

    const warningResult = await getStockInventoryReport({ status: "warning" });
    expect(warningResult.items).toHaveLength(1);
    expect(warningResult.items[0]?.sku).toBe("BRG-002");
  });
});
