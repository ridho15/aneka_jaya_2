import { describe, expect, it } from "vitest";
import { buildOperationalProfitSummary } from "@/lib/dashboard/summary";
import type { Sale } from "@/lib/types/sales";
import type { Expense } from "@/lib/types/expenses";

const sale = (id: string, date: string, qty: number, price: number): Sale => ({
  id, saleDate: date, tipeId: "W", tipeCodeSnapshot: "W", customerName: "C", paymentMethod: "Cash", total: qty * price, approvalStatus: "approved",
  items: [{ productRef: "SKU-1", productId: "SKU-1", quantity: qty, unitPrice: price, discount: 0 }]
} as unknown as Sale);

describe("dashboard laba & nett profit", () => {
  it("Laba = omset − modal; Nett profit = laba − pengeluaran (hari ini dan bulan ini)", () => {
    const sales = [sale("S1", "2026-11-06", 2, 150_000), sale("S2", "2026-11-03", 1, 150_000)];
    const expenses = [
      { id: "E1", expenseDate: "2026-11-06", tipeId: "W", tipeCodeSnapshot: "W", amount: 50_000, approvalStatus: "approved", categoryCode: "operational_expense" },
      { id: "E2", expenseDate: "2026-11-02", tipeId: "W", tipeCodeSnapshot: "W", amount: 2_000_000, approvalStatus: "approved", categoryCode: "goods_purchase" }
    ] as unknown as Expense[];
    const products = [{ id: "SKU-1", code: "SKU-1", name: "Barang", costPrice: 100_000 }] as never[];
    const s = buildOperationalProfitSummary(sales, expenses, "2026-11-06", "2026-11", 10, products);
    expect(s.todayRevenue).toBe(300_000);
    expect(s.todayCogs).toBe(200_000);
    expect(s.todayGrossProfit).toBe(100_000);
    expect(s.todayNettProfit).toBe(50_000);
    expect(s.monthlyRevenue - s.monthlyCogs).toBe(s.grossProfit);
    expect(s.grossProfit).toBe(150_000);
    // Pelunasan barang dagang bukan pengeluaran laba rugi (modalnya sudah dihitung saat barang terjual).
    expect(s.monthlyExpenses).toBe(50_000);
    expect(s.nettProfit).toBe(100_000);
    expect(s.monthlyEstimatedSalesCount).toBe(0);
  });
});
