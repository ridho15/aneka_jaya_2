import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProductSalesReport } from "@/lib/reports/productReports";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesRecord: {
      findMany: vi.fn(),
    },
  },
}));

describe("product sales report aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates sales items by product reference correctly", async () => {
    const mockSales = [
      {
        id: "SALE-001",
        saleDate: new Date("2026-08-20T10:00:00.000Z"),
        transactionNumber: "INV-001",
        customerName: "Toko A",
        paymentMethod: "Cash",
        items: [
          {
            id: "ITEM-1",
            productRef: "BRG-001 Kain Katun",
            quantity: 5,
            unitPrice: 100000,
            discount: 0,
            unitSnapshot: "Roll",
            sortOrder: 1,
          },
          {
            id: "ITEM-2",
            productRef: "BRG-002 Kain Sutra",
            quantity: 2,
            unitPrice: 200000,
            discount: 10000,
            unitSnapshot: "Meter",
            sortOrder: 2,
          },
        ],
      },
      {
        id: "SALE-002",
        saleDate: new Date("2026-08-21T11:00:00.000Z"),
        transactionNumber: "INV-002",
        customerName: "Toko B",
        paymentMethod: "Transfer",
        items: [
          {
            id: "ITEM-3",
            productRef: "BRG-001 Kain Katun",
            quantity: 3,
            unitPrice: 100000,
            discount: 0,
            unitSnapshot: "Roll",
            sortOrder: 1,
          },
        ],
      },
    ];

    vi.mocked(prisma.salesRecord.findMany).mockResolvedValue(mockSales as any);

    const result = await getProductSalesReport({
      startDate: "2026-08-01",
      endDate: "2026-08-26",
    });

    expect(result.items).toHaveLength(2);

    // BRG-001 should have 5 + 3 = 8 qty and 800000 omset
    const brg1 = result.items.find((i) => i.code === "BRG-001");
    expect(brg1).toBeDefined();
    expect(brg1?.totalQuantity).toBe(8);
    expect(brg1?.totalOmset).toBe(800000);
    expect(brg1?.transactionCount).toBe(2);
    expect(brg1?.unit).toBe("Roll");

    // BRG-002 should have 2 qty and 390000 omset (2*200000 - 10000)
    const brg2 = result.items.find((i) => i.code === "BRG-002");
    expect(brg2).toBeDefined();
    expect(brg2?.totalQuantity).toBe(2);
    expect(brg2?.totalOmset).toBe(390000);

    // Summary checks
    expect(result.summary.totalOmset).toBe(1190000);
    expect(result.summary.totalQuantity).toBe(10);
    expect(result.summary.uniqueProductsCount).toBe(2);
    expect(result.summary.topProduct?.code).toBe("BRG-001");
  });

  it("filters sales by product keyword", async () => {
    const mockSales = [
      {
        id: "SALE-001",
        saleDate: new Date("2026-08-20T10:00:00.000Z"),
        items: [
          {
            id: "ITEM-1",
            productRef: "BRG-001 Kain Katun",
            quantity: 5,
            unitPrice: 100000,
            discount: 0,
            unitSnapshot: "Roll",
            sortOrder: 1,
          },
          {
            id: "ITEM-2",
            productRef: "BRG-002 Kain Sutra",
            quantity: 2,
            unitPrice: 200000,
            discount: 0,
            unitSnapshot: "Meter",
            sortOrder: 2,
          },
        ],
      },
    ];

    vi.mocked(prisma.salesRecord.findMany).mockResolvedValue(mockSales as any);

    const result = await getProductSalesReport({
      startDate: "2026-08-01",
      endDate: "2026-08-26",
      productKeyword: "Sutra",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.code).toBe("BRG-002");
    expect(result.summary.totalOmset).toBe(400000);
  });
});
