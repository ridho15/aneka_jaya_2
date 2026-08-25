import { describe, it, expect } from "vitest";
import {
  generateProductReportExcel,
  generateStockReportExcel,
  generateDailyReportExcel,
  generateFinanceReportExcel,
} from "@/lib/reports/excelExport";

describe("Excel XML Report Exporter", () => {
  it("generates valid XML Spreadsheet for product reports with styling and totals", () => {
    const mockReport = {
      items: [
        {
          productRef: "BRG-001 Kain Katun",
          code: "BRG-001",
          name: "Kain Katun",
          totalQuantity: 10,
          unit: "Roll",
          totalOmset: 1000000,
          transactionCount: 2,
          minPrice: 100000,
          maxPrice: 100000,
          avgPrice: 100000,
        },
      ],
      transactions: [],
      summary: {
        totalOmset: 1000000,
        totalQuantity: 10,
        uniqueProductsCount: 1,
        totalTransactionsCount: 2,
      },
      filter: {
        startDate: "2026-08-01",
        endDate: "2026-08-26",
      },
      generatedAt: "2026-08-26T00:00:00.000Z",
    };

    const xml = generateProductReportExcel(mockReport);

    expect(xml).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    expect(xml).toContain("<Workbook");
    expect(xml).toContain("<Worksheet ss:Name=\"Laporan Penjualan Produk\">");
    expect(xml).toContain("LAPORAN PENJUALAN PRODUK");
    expect(xml).toContain("BRG-001");
    expect(xml).toContain("Kain Katun");
    expect(xml).toContain("GRAND TOTAL");
    expect(xml).toContain("1000000");
  });

  it("generates valid XML Spreadsheet for stock reports with status indicators", () => {
    const mockReport = {
      items: [
        {
          productId: "P-1",
          sku: "BRG-001",
          productName: "Kain Katun",
          warehouse: "Gudang Utama",
          rack: "A-1",
          quantity: 20,
          unit: "Roll",
          minStock: 5,
          costPrice: 80000,
          sellPrice: 100000,
          totalCostValuation: 1600000,
          totalSellValuation: 2000000,
          status: "safe" as const,
        },
        {
          productId: "P-2",
          sku: "BRG-002",
          productName: "Kain Sutra",
          warehouse: "Toko",
          rack: "B-2",
          quantity: 2,
          unit: "Meter",
          minStock: 10,
          costPrice: 150000,
          sellPrice: 200000,
          totalCostValuation: 300000,
          totalSellValuation: 400000,
          status: "warning" as const,
        },
      ],
      warehouses: ["Gudang Utama", "Toko"],
      summary: {
        totalItems: 2,
        totalQuantity: 22,
        totalCostValuation: 1900000,
        totalSellValuation: 2400000,
        warningCount: 1,
        outOfStockCount: 0,
        safeCount: 1,
      },
      filter: {
        warehouse: "",
        status: "all" as const,
      },
      generatedAt: "2026-08-26T00:00:00.000Z",
    };

    const xml = generateStockReportExcel(mockReport);

    expect(xml).toContain("LAPORAN PERSEDIAAN STOK BARANG");
    expect(xml).toContain("BRG-001");
    expect(xml).toContain("AMAN");
    expect(xml).toContain("BRG-002");
    expect(xml).toContain("MENIPIS");
    expect(xml).toContain("TOTAL PERSEDIAAN");
    expect(xml).toContain("1900000");
  });

  it("generates valid XML Spreadsheet for daily cash reports", () => {
    const mockDaily = {
      reportDate: "2026-08-26",
      paidSales: [
        {
          id: "S-1",
          saleDate: "2026-08-26",
          customerName: "Budi Santoso",
          paymentMethod: "Cash" as const,
          total: 500000,
          tipeCodeSnapshot: "W",
        } as any,
      ],
      grandTotal: 800000,
      totalCash: 500000,
      totalTf: 300000,
      byTipe: [],
      excludedTestCount: 0,
      excludedTestTotal: 0,
      unsyncedErpCount: 0,
      unsyncedErpTotal: 0,
      tempoPayments: [
        {
          id: "TP-1",
          paymentDate: "2026-08-26",
          customerName: "Toko Berkah",
          paymentMethod: "TF",
          amountPaid: 300000,
          notes: "Cicilan 1",
        } as any,
      ],
      tempoPaymentTotal: 300000,
      tempoReversals: [],
      tempoReversalTotal: 0,
    };

    const xml = generateDailyReportExcel(mockDaily, "2026-08-26");

    expect(xml).toContain("LAPORAN PENERIMAAN HARIAN");
    expect(xml).toContain("Budi Santoso");
    expect(xml).toContain("Toko Berkah");
    expect(xml).toContain("500000");
    expect(xml).toContain("800000");
  });

  it("generates valid XML Spreadsheet for monthly finance reports", () => {
    const mockFinance = {
      month: "2026-08",
      openTempo: [
        {
          id: "TR-1",
          transactionDate: "2026-08-10",
          customerName: "CV Maju Terus",
          dueDate: "2026-09-10",
          status: "open",
          originalAmount: 1500000,
          remainingAmount: 1500000,
        } as any,
      ],
      openTempoTotal: 1500000,
      tempoPayments: [],
      tempoPaymentTotal: 500000,
      tempoReversals: [],
      tempoReversalTotal: 0,
      approvedExpenses: [
        {
          id: "E-1",
          expenseDate: "2026-08-15",
          vendorName: "PLN",
          category: "Listrik",
          description: "Listrik Gudang",
          amount: 450000,
        } as any,
      ],
      approvedExpenseTotal: 450000,
    };

    const xml = generateFinanceReportExcel(mockFinance, "2026-08");

    expect(xml).toContain("LAPORAN FINANCE BULANAN");
    expect(xml).toContain("CV Maju Terus");
    expect(xml).toContain("PLN");
    expect(xml).toContain("Listrik Gudang");
    expect(xml).toContain("450000");
    expect(xml).toContain("1500000");
  });
});

