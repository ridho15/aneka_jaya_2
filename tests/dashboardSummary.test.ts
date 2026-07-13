import { describe, expect, it } from "vitest";
import { activityStatusText, buildCategorySummary, buildDashboardSalesMetrics, buildMonthlyPerformance, buildOperationalProfitSummary, buildPaymentBreakdown, filterDashboardSales, formatDashboardMoney, productKpi } from "@/lib/dashboard/summary";
import type { AuditLog } from "@/lib/audit/store";
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
  it("formats dashboard KPI money with internal compact million notation", () => {
    expect(formatDashboardMoney(39_000_000)).toBe("Rp 39.000 jt");
    expect(formatDashboardMoney(950_000)).toBe("Rp 950.000");
    expect(formatDashboardMoney(0)).toBe("Rp 0");
  });

  it("derives dashboard sales metrics from transaction dates only", () => {
    const backdatedCreatedToday: Sale = {
      ...sale,
      id: "backdated",
      saleDate: "2026-06-30",
      createdAt: "2026-07-02T08:00:00.000Z",
      total: 39_000_000
    };
    const todaySale: Sale = { ...sale, id: "today", saleDate: "2026-07-02", total: 950_000 };
    const metrics = buildDashboardSalesMetrics([backdatedCreatedToday, todaySale], "2026-07-02", "2026-07");

    expect(metrics.salesToday).toEqual([todaySale]);
    expect(metrics.totalToday).toBe(950_000);
    expect(metrics.salesThisMonth).toEqual([todaySale]);
    expect(metrics.totalThisMonth).toBe(950_000);
  });

  it("separates approved omzet from received Cash/TF totals", () => {
    const cashSale: Sale = { ...sale, id: "cash", saleDate: "2026-07-02", paymentMethod: "Cash", total: 100_000 };
    const transferSale: Sale = { ...sale, id: "tf", saleDate: "2026-07-03", paymentMethod: "TF", total: 200_000 };
    const tempoSale: Sale = { ...sale, id: "tempo", saleDate: "2026-07-04", paymentMethod: "Tempo", total: 900_000 };
    const pendingSale: Sale = { ...sale, id: "pending", saleDate: "2026-07-05", paymentMethod: "Cash", total: 700_000, approvalStatus: "pending_approval" };

    const metrics = buildDashboardSalesMetrics([cashSale, transferSale, tempoSale, pendingSale], "2026-07-02", "2026-07");

    expect(metrics.totalThisMonth).toBe(1_200_000);
    expect(metrics.totalReceivedThisMonth).toBe(300_000);
    expect(metrics.receivedThisMonth).toEqual([cashSale, transferSale]);
  });

  it("filters dashboard sales by date, payment method, and rekening", () => {
    const bcaTransfer: Sale = { ...sale, id: "bca", saleDate: "2026-07-02", paymentMethod: "TF", rekeningId: "bca", rekeningNameSnapshot: "BCA Operasional", total: 300_000 };
    const mandiriTransfer: Sale = { ...sale, id: "mandiri", saleDate: "2026-07-03", paymentMethod: "TF", rekeningId: "mandiri", rekeningNameSnapshot: "Mandiri", total: 400_000 };
    const oldCash: Sale = { ...sale, id: "old-cash", saleDate: "2026-06-30", paymentMethod: "Cash", rekeningId: "cash", rekeningNameSnapshot: "Kas", total: 500_000 };

    expect(filterDashboardSales([bcaTransfer, mandiriTransfer, oldCash], {
      from: "2026-07-01",
      to: "2026-07-31",
      paymentMethod: "TF",
      rekening: "bca"
    })).toEqual([bcaTransfer]);
  });

  it("builds Cash and TF per-bank payment breakdown with rekening labels", () => {
    const result = buildPaymentBreakdown([
      { ...sale, id: "cash", paymentMethod: "Cash", total: 100_000 },
      { ...sale, id: "bca", paymentMethod: "TF", rekeningId: "bca", rekeningNameSnapshot: "BCA Operasional", total: 300_000 },
      { ...sale, id: "mandiri", paymentMethod: "TF", rekeningId: "mandiri", rekeningNameSnapshot: "Mandiri", total: 600_000 },
      { ...sale, id: "tempo", paymentMethod: "Tempo", total: 900_000 }
    ], {
      bca: "BCA Operasional - BCA",
      mandiri: "Mandiri Utama - Bank Mandiri"
    });

    expect(result.total).toBe(1_000_000);
    expect(result.cash).toMatchObject({ label: "Cash", value: 100_000, percentage: 10 });
    expect(result.transfers).toEqual([
      { label: "Mandiri Utama - Bank Mandiri", value: 600_000, percentage: 60 },
      { label: "BCA Operasional - BCA", value: 300_000, percentage: 30 }
    ]);
  });

  it("aggregates real approved sales and ExpenseRecord expenses by month", () => {
    const result = buildMonthlyPerformance([sale], [expense], new Date("2026-06-29T00:00:00.000Z"));
    expect(result).toHaveLength(6);
    expect(result.at(-1)).toMatchObject({ key: "2026-06", sales: 200_000, expenses: 50_000 });
  });

  it("uses the dashboard date filter range for performance buckets", () => {
    const result = buildMonthlyPerformance([
      { ...sale, id: "filtered-sale", saleDate: "2026-01-10", total: 100_000 }
    ], [
      { ...expense, id: "filtered-expense", expenseDate: "2026-03-11", amount: 50_000 }
    ], new Date("2026-07-02T00:00:00.000Z"), { from: "2026-01-01", to: "2026-03-31" });

    expect(result.map((row) => row.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(result[0]).toMatchObject({ sales: 100_000, expenses: 0 });
    expect(result[2]).toMatchObject({ sales: 0, expenses: 50_000 });
  });

  it("calculates operational profit summary from approved non-AJ transaction dates and custom percent", () => {
    const walkInSale: Sale = { ...sale, id: "w-month", tipeId: "W", tipeCodeSnapshot: "W", saleDate: "2026-07-02", total: 1_000_000 };
    const slmToday: Sale = { ...sale, id: "slm-today", tipeId: "SLM", tipeCodeSnapshot: "SLM", saleDate: "2026-07-08", total: 500_000 };
    const onlineSale: Sale = { ...sale, id: "online", tipeId: "ONLINE", tipeCodeSnapshot: "ONLINE", saleDate: "2026-07-08", total: 250_000 };
    const ajSale: Sale = { ...sale, id: "aj", tipeId: "AJ", tipeCodeSnapshot: "AJ", saleDate: "2026-07-08", total: 900_000 };
    const erpSale: Sale = { ...sale, id: "erp", tipeId: "SLM", tipeCodeSnapshot: "SLM", saleDate: "2026-07-08", total: 800_000, syncTarget: "erp" };
    const pendingOperational: Sale = { ...sale, id: "pending-operational", tipeId: "W", tipeCodeSnapshot: "W", saleDate: "2026-07-08", total: 700_000, approvalStatus: "pending_approval" };
    const backdatedCreatedToday: Sale = { ...sale, id: "backdated-created", tipeId: "ONLINE", tipeCodeSnapshot: "ONLINE", saleDate: "2026-06-30", createdAt: "2026-07-08T10:00:00.000Z", total: 300_000 };
    const walkInExpense: Expense = { ...expense, id: "w-expense", tipeId: "W", tipeCodeSnapshot: "W", expenseDate: "2026-07-03", amount: 200_000 };
    const slmTodayExpense: Expense = { ...expense, id: "slm-today-expense", tipeId: "SLM", tipeCodeSnapshot: "SLM", expenseDate: "2026-07-08", amount: 50_000 };
    const onlineExpense: Expense = { ...expense, id: "online-expense", tipeId: "ONLINE", tipeCodeSnapshot: "ONLINE", expenseDate: "2026-07-08", amount: 25_000 };
    const ajExpense: Expense = { ...expense, id: "aj-expense", tipeId: "AJ", tipeCodeSnapshot: "AJ", expenseDate: "2026-07-08", amount: 900_000 };
    const rejectedOperationalExpense: Expense = { ...expense, id: "rejected-operational", tipeId: "SLM", tipeCodeSnapshot: "SLM", expenseDate: "2026-07-08", amount: 70_000, approvalStatus: "rejected" };

    const result = buildOperationalProfitSummary(
      [walkInSale, slmToday, onlineSale, ajSale, erpSale, pendingOperational, backdatedCreatedToday],
      [walkInExpense, slmTodayExpense, onlineExpense, ajExpense, rejectedOperationalExpense],
      "2026-07-08",
      "2026-07",
      20
    );

    expect(result).toMatchObject({
      grossProfitPercent: 20,
      monthlyRevenue: 2_550_000,
      monthlyExpenses: 275_000,
      todayRevenue: 1_550_000,
      todayExpenses: 75_000,
      grossProfit: 510_000,
      nettProfit: 235_000,
      monthlySalesCount: 4,
      todaySalesCount: 3
    });
  });

  it("defaults operational gross profit percent to zero when no setting is provided", () => {
    const result = buildOperationalProfitSummary([{ ...sale, tipeId: "W", tipeCodeSnapshot: "W", saleDate: "2026-07-08", total: 1_000_000 }], [], "2026-07-08", "2026-07");

    expect(result.grossProfitPercent).toBe(0);
    expect(result.grossProfit).toBe(0);
    expect(result.nettProfit).toBe(0);
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

  it("keeps category summaries scoped to the supplied sales period", () => {
    const products = [{ id: "1", code: "SKU-1", name: "Produk", category: "Utama" }] as Product[];
    const currentMonthSale = { ...sale, id: "current", saleDate: "2026-07-02", total: 100_000, items: [{ productRef: "SKU-1", quantity: 1, unitPrice: 100_000 }] };
    const previousMonthSale = { ...sale, id: "previous", saleDate: "2026-06-30", total: 900_000, items: [{ productRef: "SKU-1", quantity: 9, unitPrice: 100_000 }] };
    const { salesThisMonth } = buildDashboardSalesMetrics([currentMonthSale, previousMonthSale], "2026-07-02", "2026-07");

    expect(buildCategorySummary(salesThisMonth, products)).toEqual([
      { label: "Utama", value: 100_000, percentage: 100 }
    ]);
  });

  it("does not show successful ERP product copy when products fail to load", () => {
    expect(productKpi(false, 0, "Konfigurasi ERP belum lengkap.")).toEqual({
      value: "Tidak tersedia",
      change: "Konfigurasi ERP belum lengkap."
    });
    expect(productKpi(true, 12)).toEqual({
      value: "12 item",
      change: "Semua gudang terpantau"
    });
  });

  it("labels latest activity with neutral audit statuses", () => {
    const baseAudit = {
      id: "audit-1",
      entityType: "sales",
      entityId: "sale-1",
      action: "create",
      userId: "user-1",
      userNameSnapshot: "User",
      userRoleSnapshot: "OWNER",
      createdAt: "2026-07-02T00:00:00.000Z"
    } as AuditLog;

    expect(activityStatusText(baseAudit)).toBe("Tercatat");
    expect(activityStatusText({ ...baseAudit, action: "cancel" })).toBe("Dibatalkan");
    expect(activityStatusText({ ...baseAudit, action: "reject" })).toBe("Ditolak");
    expect(activityStatusText({ ...baseAudit, action: "archive" })).toBe("Audit");
  });
});
