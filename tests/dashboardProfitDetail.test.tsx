import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildDashboardProfitDetails,
  type DashboardProfitDetails,
} from "@/lib/dashboard/summary";
import { ProfitDetailView } from "@/components/dashboard/ProfitDetailView";
import type { Sale } from "@/lib/types/sales";
import type { Expense } from "@/lib/types/expenses";

describe("Dashboard Profit Details Unit & Component Tests", () => {
  const mockSales: Sale[] = [
    {
      id: "sale-1",
      saleDate: "2026-09-10",
      transactionNumber: "INV-0910-001",
      customerName: "Budi Santoso",
      paymentMethod: "Cash",
      approvalStatus: "approved",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      total: 200000,
      items: [
        {
          productRef: "BRG-REAL",
          productId: "prod-real",
          quantity: 2,
          unitPrice: 100000,
          discount: 0,
          manualProduct: {
            name: "Barang Real",
            costPrice: 70000,
          },
        },
      ],
    },
    {
      id: "sale-2",
      saleDate: "2026-09-12",
      transactionNumber: "INV-0912-002",
      customerName: "Pelanggan Walk In",
      paymentMethod: "TF",
      rekeningNameSnapshot: "BCA Toko",
      approvalStatus: "approved",
      tipeId: "W",
      tipeCodeSnapshot: "W",
      total: 100000,
      items: [
        {
          productRef: "BRG-ESTIMASI",
          productId: "prod-est",
          quantity: 1,
          unitPrice: 100000,
          discount: 0,
          // No costPrice, will use fallback 15%
        },
      ],
    },
  ];

  const mockExpenses: Expense[] = [
    {
      id: "exp-1",
      expenseDate: "2026-09-11",
      amount: 25000,
      category: "Operasional Toko",
      vendorName: "Toko Plastik",
      description: "Kresek Packing",
      approvalStatus: "approved",
      tipeId: "W",
      tipeCodeSnapshot: "W",
    },
  ];

  it("calculates buildDashboardProfitDetails accurately with real cost and fallback margin", () => {
    const details = buildDashboardProfitDetails(mockSales, mockExpenses, {
      fallbackMarginPercent: 15,
    });

    expect(details.totalRevenue).toBe(300000);
    // Sale 1: Omzet 200k, Modal 2 * 70k = 140k, Gross = 60k
    // Sale 2: Omzet 100k, Fallback 15% -> Gross = 15k, Modal = 85k
    // Total Cost = 140k + 85k = 225k
    // Total Gross = 60k + 15k = 75k
    expect(details.totalCost).toBe(225000);
    expect(details.grossProfit).toBe(75000);

    // Total Expenses = 25k
    expect(details.totalExpenses).toBe(25000);
    // Nett Profit = Gross (75k) - Expenses (25k) = 50k
    expect(details.nettProfit).toBe(50000);

    expect(details.salesCount).toBe(2);
    expect(details.expensesCount).toBe(1);
    expect(details.realCostItemsCount).toBe(1);
    expect(details.totalItemsCount).toBe(2);
  });

  it("renders ProfitDetailView with 5 financial pillars and sales table", () => {
    const details: DashboardProfitDetails = {
      periodLabel: "September 2026",
      fallbackMarginPercent: 15,
      totalRevenue: 300000,
      totalCost: 225000,
      grossProfit: 75000,
      effectiveMarginPercent: 25.0,
      totalExpenses: 25000,
      nettProfit: 50000,
      realCostItemsCount: 1,
      totalItemsCount: 2,
      salesCount: 2,
      expensesCount: 1,
      sales: [
        {
          id: "sale-1",
          saleDate: "2026-09-10",
          transactionNumber: "INV-0910-001",
          customerName: "Budi Santoso",
          paymentMethod: "Cash",
          tipeCode: "W",
          revenue: 200000,
          cost: 140000,
          grossProfit: 60000,
          marginPercent: 30.0,
          hasRealCost: true,
          items: [
            {
              productRef: "BRG-REAL",
              quantity: 2,
              unitPrice: 100000,
              costPrice: 70000,
              discount: 0,
              revenue: 200000,
              cost: 140000,
              grossProfit: 60000,
              marginPercent: 30.0,
              isRealCost: true,
            },
          ],
        },
      ],
      expenses: [
        {
          id: "exp-1",
          expenseDate: "2026-09-11",
          category: "Operasional Toko",
          vendorName: "Toko Plastik",
          description: "Kresek Packing",
          amount: 25000,
        },
      ],
    };

    const html = renderToStaticMarkup(<ProfitDetailView data={details} />);

    // Check financial pillars
    expect(html).toContain("Rekonsiliasi Sumber Data Profit");
    expect(html).toContain("Kalkulasi Laba Bersih Operasional");
    expect(html).toContain("1. Total Omzet Jual");
    expect(html).toContain("2. Total Modal / HPP");
    expect(html).toContain("3. Gross Profit (Laba Kotor)");
    expect(html).toContain("4. Pengeluaran Operasional");
    expect(html).toContain("5. Nett Profit (Laba Bersih)");

    // Check tabs
    expect(html).toContain("Sumber Penjualan (1)");
    expect(html).toContain("Sumber Pengeluaran (1)");

    // Check transaction row
    expect(html).toContain("INV-0910-001");
    expect(html).toContain("Budi Santoso");
    expect(html).toContain("Dihitung dari HPP real master produk");
  });
});
