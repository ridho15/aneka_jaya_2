import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import { getCustomerSalesReport } from "@/lib/reports/customers";
import * as salesStore from "@/lib/sales/store";
import * as tempoStore from "@/lib/tempo/store";
import type { Sale } from "@/lib/types/sales";

vi.mock("@/lib/sales/store", () => ({
  listSalesRecords: vi.fn(),
}));

vi.mock("@/lib/tempo/store", () => ({
  listTempoReceivables: vi.fn(),
}));

describe("Customer Sales Report Aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const dummySales: Partial<Sale>[] = [
    {
      id: "S-01",
      customerName: "Indah ask",
      customerLocation: "Jakarta",
      saleDate: "2026-08-10",
      total: 1000000,
      approvalStatus: "approved",
      isTestTransaction: false,
      tipeId: "W",
      tipeCodeSnapshot: "W",
      items: [
        {
          productRef: "Ubr100Glp",
          quantity: 10,
          unitPrice: 100000,
          discount: 0,
        },
      ],
    },
    {
      id: "S-02",
      customerName: "Indah Ask", // Different casing!
      customerLocation: "Jakarta Barat",
      saleDate: "2026-08-15",
      total: 2000000,
      approvalStatus: "approved",
      isTestTransaction: false,
      tipeId: "W",
      tipeCodeSnapshot: "W",
      items: [
        {
          productRef: "AJKP47-1",
          quantity: 20,
          unitPrice: 100000,
          discount: 0,
        },
      ],
    },
    {
      id: "S-03",
      customerName: "Toko Grosir Mawar",
      customerLocation: "Bandung",
      saleDate: "2026-08-20",
      total: 5000000,
      approvalStatus: "approved",
      isTestTransaction: false,
      tipeId: "AJ",
      tipeCodeSnapshot: "AJ",
      items: [
        {
          productRef: "AMJ07-2",
          quantity: 50,
          unitPrice: 100000,
          discount: 0,
        },
      ],
    },
    {
      id: "S-04",
      customerName: "Toko Kecil",
      customerLocation: "Bogor",
      saleDate: "2026-08-25",
      total: 500000,
      approvalStatus: "approved",
      isTestTransaction: false,
      tipeId: "W",
      tipeCodeSnapshot: "W",
      items: [
        {
          productRef: "Stiker AJKP48-13",
          quantity: 5,
          unitPrice: 100000,
          discount: 0,
        },
      ],
    },
    {
      id: "S-05_DRAFT",
      customerName: "Customer Draft",
      saleDate: "2026-08-26",
      total: 9999999,
      approvalStatus: "draft", // Should be excluded
      isTestTransaction: false,
      items: [],
    },
  ];

  it("groups customers with same name regardless of casing and whitespace", async () => {
    vi.mocked(salesStore.listSalesRecords).mockResolvedValue(
      dummySales as Sale[]
    );
    vi.mocked(tempoStore.listTempoReceivables).mockResolvedValue([]);

    const result = await getCustomerSalesReport();

    // Total distinct customers should be 3: "Indah Ask", "Toko Grosir Mawar", "Toko Kecil"
    expect(result.summary.totalCustomers).toBe(3);

    const indah = result.data.find(
      (c) => c.customerKey === "indah ask"
    );
    expect(indah).toBeDefined();
    // 1.000.000 + 2.000.000 = 3.000.000
    expect(indah?.totalRevenue).toBe(3000000);
    // 2 transactions combined
    expect(indah?.totalOrders).toBe(2);
    // 10 + 20 = 30 quantity
    expect(indah?.totalQuantity).toBe(30);
    // Average Order Value = 3.000.000 / 2 = 1.500.000
    expect(indah?.averageOrderValue).toBe(1500000);
  });

  it("sorts by omset_desc correctly (terbanyak ke paling sedikit)", async () => {
    vi.mocked(salesStore.listSalesRecords).mockResolvedValue(
      dummySales as Sale[]
    );
    vi.mocked(tempoStore.listTempoReceivables).mockResolvedValue([]);

    const result = await getCustomerSalesReport({
      sortBy: "omset",
      sortOrder: "desc",
    });

    expect(result.data.length).toBe(3);
    // #1 Toko Grosir Mawar (5.000.000)
    expect(result.data[0].customerName).toBe("Toko Grosir Mawar");
    expect(result.data[0].totalRevenue).toBe(5000000);
    // #2 Indah Ask (3.000.000)
    expect(result.data[1].totalRevenue).toBe(3000000);
    // #3 Toko Kecil (500.000)
    expect(result.data[2].customerName).toBe("Toko Kecil");
    expect(result.data[2].totalRevenue).toBe(500000);
  });

  it("sorts by orders_desc correctly (frekuensi terbanyak ke tersedikit)", async () => {
    vi.mocked(salesStore.listSalesRecords).mockResolvedValue(
      dummySales as Sale[]
    );
    vi.mocked(tempoStore.listTempoReceivables).mockResolvedValue([]);

    const result = await getCustomerSalesReport({
      sortBy: "orders",
      sortOrder: "desc",
    });

    // Indah has 2 orders, others have 1 order
    expect(result.data[0].customerKey).toBe("indah ask");
    expect(result.data[0].totalOrders).toBe(2);
  });

  it("sorts by qty_desc correctly (kuantitas terbanyak ke tersedikit)", async () => {
    vi.mocked(salesStore.listSalesRecords).mockResolvedValue(
      dummySales as Sale[]
    );
    vi.mocked(tempoStore.listTempoReceivables).mockResolvedValue([]);

    const result = await getCustomerSalesReport({
      sortBy: "qty",
      sortOrder: "desc",
    });

    // Toko Grosir Mawar has 50 qty
    expect(result.data[0].customerName).toBe("Toko Grosir Mawar");
    expect(result.data[0].totalQuantity).toBe(50);
  });

  it("filters by keyword correctly", async () => {
    vi.mocked(salesStore.listSalesRecords).mockResolvedValue(
      dummySales as Sale[]
    );
    vi.mocked(tempoStore.listTempoReceivables).mockResolvedValue([]);

    const result = await getCustomerSalesReport({ keyword: "Mawar" });
    expect(result.data.length).toBe(1);
    expect(result.data[0].customerName).toBe("Toko Grosir Mawar");
  });

  it("maps open tempo balance to customer correctly", async () => {
    vi.mocked(salesStore.listSalesRecords).mockResolvedValue(
      dummySales as Sale[]
    );
    vi.mocked(tempoStore.listTempoReceivables).mockResolvedValue([
      {
        id: "T-01",
        customerName: "INDAH ASK",
        remainingAmount: 750000,
        status: "open",
      } as any,
    ]);

    const result = await getCustomerSalesReport();
    const indah = result.data.find((c) => c.customerKey === "indah ask");
    expect(indah?.hasOpenTempo).toBe(true);
    expect(indah?.openTempoBalance).toBe(750000);
  });
});
