import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProfitDetailView } from "@/components/dashboard/ProfitDetailView";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

const mocks = vi.hoisted(() => ({
  getCurrentRole: vi.fn(),
  getStockInventoryReport: vi.fn(),
  getProductSalesReport: vi.fn(),
  getPaidSalesReport: vi.fn(),
  listTempoReceivables: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentRole: mocks.getCurrentRole,
}));

vi.mock("@/lib/reports/stockReports", () => ({
  getStockInventoryReport: mocks.getStockInventoryReport,
}));

vi.mock("@/lib/reports/productReports", () => ({
  getProductSalesReport: mocks.getProductSalesReport,
}));

vi.mock("@/lib/reports/store", () => ({
  getPaidSalesReport: mocks.getPaidSalesReport,
}));

vi.mock("@/lib/tempo/store", () => ({
  listTempoReceivables: mocks.listTempoReceivables,
}));

const { default: StockReportsPage } = await import("@/app/reports/stocks/page");
const { default: ProductReportsPage } = await import("@/app/reports/products/page");
const { default: ReportsPage } = await import("@/app/reports/page");

describe("Pagination Kategori B Verification", () => {
  describe("1. Laporan Persediaan Stok Barang (StockReportsPage)", () => {
    it("slices items to pageSize=25 and renders pagination bar and footer grand total", async () => {
      mocks.getCurrentRole.mockResolvedValue("OWNER");
      const mockItems = Array.from({ length: 60 }, (_, i) => ({
        sku: `SKU-${i + 1}`,
        productName: `Produk ${i + 1}`,
        warehouse: "Gudang Utama",
        rack: "A1",
        quantity: 10,
        minStock: 2,
        status: "safe",
        costPrice: 5000,
        totalCostValuation: 50000,
        unit: "Pcs",
      }));

      mocks.getStockInventoryReport.mockResolvedValue({
        warehouses: ["Gudang Utama"],
        items: mockItems,
        summary: {
          totalItems: 60,
          totalQuantity: 600,
          totalCostValuation: 3000000,
          warningCount: 0,
          outOfStockCount: 0,
          safeCount: 60,
        },
      });

      // Page 1
      const htmlPage1 = renderToStaticMarkup(
        await StockReportsPage({ searchParams: Promise.resolve({ page: "1", pageSize: "25" }) })
      );

      expect(htmlPage1).toContain("SKU-1");
      expect(htmlPage1).toContain("SKU-25");
      expect(htmlPage1).not.toContain("SKU-26"); // sliced
      expect(htmlPage1).toContain("Halaman 1 dari 3");
      expect(htmlPage1).toContain("Menampilkan");
      expect(htmlPage1).toContain("Berikutnya");
      expect(htmlPage1).toContain("Total Persediaan (Semua 60 Item)"); // Grand total preserved!

      // Page 2
      const htmlPage2 = renderToStaticMarkup(
        await StockReportsPage({ searchParams: Promise.resolve({ page: "2", pageSize: "25" }) })
      );

      expect(htmlPage2).toContain("SKU-26");
      expect(htmlPage2).toContain("SKU-50");
      expect(htmlPage2).not.toContain("SKU-1");
      expect(htmlPage2).toContain("Halaman 2 dari 3");
      expect(htmlPage2).toContain("Sebelumnya");
      expect(htmlPage2).toContain("Berikutnya");
    });
  });

  describe("2. Laporan Penjualan Produk (ProductReportsPage)", () => {
    it("slices products to 25 items and renders pagination controls while preserving grand total", async () => {
      mocks.getCurrentRole.mockResolvedValue("OWNER");
      const mockItems = Array.from({ length: 30 }, (_, i) => ({
        productRef: `ref-${i + 1}`,
        code: `PRD-${i + 1}`,
        name: `Barang ${i + 1}`,
        unit: "Pcs",
        totalQuantity: 5,
        transactionCount: 2,
        avgPrice: 10000,
        totalOmset: 50000,
      }));

      mocks.getProductSalesReport.mockResolvedValue({
        items: mockItems,
        summary: {
          totalQuantity: 150,
          totalOmset: 1500000,
          totalTransactionsCount: 60,
          uniqueProductsCount: 30,
          topProduct: null,
        },
      });

      const html = renderToStaticMarkup(
        await ProductReportsPage({ searchParams: Promise.resolve({ page: "1", pageSize: "25" }) })
      );

      expect(html).toContain("PRD-1");
      expect(html).toContain("PRD-25");
      expect(html).not.toContain("PRD-26");
      expect(html).toContain("Halaman 1 dari 2");
      expect(html).toContain("Total Keseluruhan (Semua 30 Produk)");
      expect(html).toContain("Berikutnya");
    });
  });

  describe("3. Rincian Sumber Data Profit (ProfitDetailView)", () => {
    it("renders client pagination bar and shows first 15 sales items", () => {
      const mockSales = Array.from({ length: 20 }, (_, i) => ({
        id: `S-${i + 1}`,
        customerName: `Customer ${i + 1}`,
        tipeCodeSnapshot: "W",
        paymentMethod: "CASH",
        saleDate: "2026-09-01",
        revenue: 100000,
        cost: 70000,
        profit: 30000,
        marginPercent: 30,
        itemsCount: 1,
        items: [],
      }));

      const data: any = {
        periodLabel: "September 2026",
        effectiveMarginPercent: 30,
        totalRevenue: 2000000,
        totalCost: 1400000,
        grossProfit: 600000,
        totalExpenses: 200000,
        operationalNetProfit: 400000,
        salesCount: 20,
        expensesCount: 0,
        sales: mockSales,
        expenses: [],
        fallbackMarginPercent: 20,
        realCostItemsCount: 20,
        totalItemsCount: 20,
      };

      const html = renderToStaticMarkup(<ProfitDetailView data={data} />);

      expect(html).toContain("Customer 1");
      expect(html).toContain("Customer 15");
      expect(html).not.toContain("Customer 16"); // sliced to 15!
      expect(html).toContain("Halaman 1 dari 2");
      expect(html).toContain("Sebelumnya");
      expect(html).toContain("Berikutnya");
    });
  });

  describe("4. Laporan Kasir Harian (ReportsPage)", () => {
    it("slices paidSales to 15 items and displays pagination bar", async () => {
      mocks.getCurrentRole.mockResolvedValue("OWNER");
      const mockPaidSales = Array.from({ length: 20 }, (_, i) => ({
        id: `PS-${i + 1}`,
        customerName: `Customer Paid ${i + 1}`,
        tipeCodeSnapshot: "W",
        paymentMethod: "CASH",
        syncTarget: "erp",
        syncStatus: "synced",
        total: 50000,
      }));

      mocks.getPaidSalesReport.mockResolvedValue({
        paidSales: mockPaidSales,
        grandTotal: 1000000,
        totalCash: 1000000,
        totalTf: 0,
        unsyncedErpTotal: 0,
        unsyncedErpCount: 0,
        excludedTestCount: 0,
        excludedTestTotal: 0,
        tempoPayments: [],
        tempoPaymentTotal: 0,
        tempoReversals: [],
        tempoReversalTotal: 0,
        byTipe: [],
      });

      mocks.listTempoReceivables.mockResolvedValue([]);

      const html = renderToStaticMarkup(
        await ReportsPage({ searchParams: Promise.resolve({ page: "1" }) })
      );

      expect(html).toContain("Customer Paid 1");
      expect(html).toContain("Customer Paid 15");
      expect(html).not.toContain("Customer Paid 16"); // sliced to 15
      expect(html).toMatch(/Halaman.*1.*dari.*2/);
      expect(html).toContain("Sebelumnya");
      expect(html).toContain("Berikutnya");
    });
  });
});
