import { describe, expect, it } from "vitest";
import { buildCategorySummary, buildMonthlyPerformance } from "@/lib/dashboard/summary";
import type { Expense } from "@/lib/types/expenses";
import type { Product } from "@/lib/types/product";
import type { Sale } from "@/lib/types/sales";

const sale: Sale = {
  id: "sale-1",
  saleDate: "2026-06-10",
  customerName: "Pelanggan",
  paymentMethod: "Cash",
  total: 200_000,
  approvalStatus: "approved",
  items: [{ productRef: "SKU-1", quantity: 2, unitPrice: 100_000 }]
};

const expense: Expense = {
  id: "expense-1",
  expenseDate: "2026-06-11",
  tipeId: "AJ",
  tipeCodeSnapshot: "AJ",
  tipeNameSnapshot: "AJ",
  rekeningId: "cash-aj",
  rekeningNameSnapshot: "Kas AJ",
  coaId: "Kas",
  coaNameSnapshot: "Kas",
  category: "Operasional",
  vendorName: "Vendor",
  description: "Biaya",
  amount: 50_000,
  paymentMethod: "Cash",
  approvalStatus: "approved"
};

describe("dashboard summaries", () => {
  it("aggregates real approved sales and ExpenseRecord expenses by month", () => {
    const result = buildMonthlyPerformance([sale], [expense], new Date("2026-06-29T00:00:00.000Z"));
    expect(result).toHaveLength(6);
    expect(result.at(-1)).toMatchObject({ key: "2026-06", sales: 200_000, expenses: 50_000 });
  });

  it("does not count pending or rejected expenses", () => {
    const result = buildMonthlyPerformance([], [
      { ...expense, id: "pending", approvalStatus: "pending_approval" },
      { ...expense, id: "rejected", approvalStatus: "rejected" }
    ], new Date("2026-06-29T00:00:00.000Z"));
    expect(result.at(-1)).toMatchObject({ key: "2026-06", expenses: 0 });
  });

  it("returns zeroes instead of fabricated values when transactions are empty", () => {
    expect(buildMonthlyPerformance([], [], new Date("2026-06-29T00:00:00.000Z")).every((row) => row.sales === 0 && row.expenses === 0)).toBe(true);
    expect(buildCategorySummary([], [])).toEqual([]);
  });

  it("derives category distribution from ERP product references", () => {
    const products = [{ id: "1", code: "SKU-1", name: "Produk", category: "Utama" }] as Product[];
    expect(buildCategorySummary([sale], products)).toEqual([
      { label: "Utama", value: 200_000, percentage: 100 }
    ]);
  });
});
