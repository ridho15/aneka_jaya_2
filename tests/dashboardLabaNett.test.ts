import { describe, expect, it } from "vitest";
import { buildMonthlyPerformance, buildOperationalProfitSummary, hitungLabaNota } from "@/lib/dashboard/summary";
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

  it("modal 0, Rp 1, atau tidak masuk akal memakai aturan GP (11%): modal = omset × 89%", () => {
    const peta = new Map([["nol", 0], ["satu", 1], ["aneh", 900_000], ["ok", 80_000]]);
    const nota = (ref: string) => ({ ...sale("X", "2026-11-06", 10, 100_000), items: [{ productRef: ref, productId: ref, quantity: 10, unitPrice: 100_000, discount: 0 }] }) as unknown as Sale;
    for (const ref of ["nol", "satu", "aneh"]) {
      const r = hitungLabaNota(nota(ref), 11, peta);
      expect(r).toMatchObject({ omset: 1_000_000, modal: 890_000, laba: 110_000, itemEstimasi: 1 });
    }
    expect(hitungLabaNota(nota("ok"), 11, peta)).toMatchObject({ omset: 1_000_000, modal: 800_000, laba: 200_000, itemEstimasi: 0 });
  });

  it("transaksi MJ: omset SLM = nota ÷ 1,1, tetap omset − modal", () => {
    const mj = { ...sale("MJ1", "2026-11-06", 1, 110_000), source: "MJ" } as unknown as Sale;
    const r = hitungLabaNota(mj, 11, new Map([["sku-1", 60_000]]));
    expect(r).toMatchObject({ omset: 100_000, modal: 60_000, laba: 40_000 });
  });

  it("grafik bulanan memakai angka & filter yang sama dengan ringkasan", () => {
    const sales = [sale("S1", "2026-11-06", 2, 150_000), { ...sale("AJ", "2026-11-05", 1, 999_000), tipeId: "AJ", tipeCodeSnapshot: "AJ" } as unknown as Sale];
    const expenses = [
      { id: "E1", expenseDate: "2026-11-06", tipeId: "W", tipeCodeSnapshot: "W", amount: 50_000, approvalStatus: "approved", categoryCode: "operational_expense" },
      { id: "E2", expenseDate: "2026-11-02", tipeId: "W", tipeCodeSnapshot: "W", amount: 2_000_000, approvalStatus: "approved", categoryCode: "goods_purchase" }
    ] as unknown as Expense[];
    const products = [{ id: "SKU-1", code: "SKU-1", name: "Barang", costPrice: 100_000 }] as never[];
    const summary = buildOperationalProfitSummary(sales, expenses, "2026-11-06", "2026-11", 11, products);
    const month = buildMonthlyPerformance(sales, expenses, new Date("2026-11-15"), {}, 11, products).find((m) => m.key === "2026-11")!;
    expect([month.sales, month.cogs, month.grossProfit, month.expenses, month.nettProfit])
      .toEqual([summary.monthlyRevenue, summary.monthlyCogs, summary.grossProfit, summary.monthlyExpenses, summary.nettProfit]);
  });
});
