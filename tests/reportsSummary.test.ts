import { describe, expect, it } from "vitest";
import { buildFinanceReportSummary, buildPaidSalesReport } from "@/lib/reports/summary";
import type { Expense } from "@/lib/types/expenses";
import type { Sale } from "@/lib/types/sales";
import type { TempoPayment, TempoReceivable } from "@/lib/tempo/store";

const baseSale: Sale = {
  id: "S-1",
  saleDate: "2026-06-29",
  customerName: "Budi",
  paymentMethod: "Cash",
  total: 100_000,
  approvalStatus: "approved",
  tipeCodeSnapshot: "AJ",
  items: []
};

const baseTempo: TempoReceivable = {
  id: "TMP-1",
  salesId: "S-1",
  tipeId: "AJ",
  tipeCodeSnapshot: "AJ",
  tipeNameSnapshot: "AJ",
  customerName: "Budi",
  originalAmount: 500_000,
  paidAmount: 100_000,
  remainingAmount: 400_000,
  transactionDate: "2026-06-01",
  dueDate: "2026-06-30",
  status: "partial_paid",
  createdByUserId: "u-1",
  createdByNameSnapshot: "User",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z"
};

const basePayment: TempoPayment = {
  id: "TPY-1",
  tempoReceivableId: "TMP-1",
  paymentDate: "2026-06-29",
  amountPaid: 100_000,
  paymentMethod: "TF",
  rekeningId: "bank",
  rekeningNameSnapshot: "Bank",
  createdByUserId: "u-1",
  createdByNameSnapshot: "User",
  createdAt: "2026-06-29T00:00:00.000Z"
};

const baseExpense: Expense = {
  id: "E-1",
  expenseDate: "2026-06-29",
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
  amount: 75_000,
  paymentMethod: "Cash",
  approvalStatus: "approved"
};

describe("report summaries", () => {
  it("counts only approved Cash and TF sales for daily paid report", () => {
    const report = buildPaidSalesReport([
      baseSale,
      { ...baseSale, id: "S-2", paymentMethod: "TF", total: 200_000 },
      { ...baseSale, id: "S-ERP-FAILED", paymentMethod: "Cash", total: 50_000, syncTarget: "erp", syncStatus: "failed" },
      { ...baseSale, id: "S-ERP-PENDING", paymentMethod: "TF", total: 25_000, syncTarget: "erp", syncStatus: "pending" },
      { ...baseSale, id: "S-ERP-SYNCED", paymentMethod: "Cash", total: 10_000, syncTarget: "erp", syncStatus: "synced" },
      { ...baseSale, id: "S-LOCAL", paymentMethod: "TF", total: 15_000, syncTarget: "local", syncStatus: "local" },
      { ...baseSale, id: "S-QA", paymentMethod: "Cash", total: 999_000, isTestTransaction: true },
      { ...baseSale, id: "S-3", paymentMethod: "Tempo", total: 300_000 },
      { ...baseSale, id: "S-4", paymentMethod: "Cash", approvalStatus: "pending_approval", total: 400_000 },
      { ...baseSale, id: "S-5", saleDate: "2026-06-28", total: 500_000 }
    ], "2026-06-29");

    expect(report.grandTotal).toBe(400_000);
    expect(report.totalCash).toBe(160_000);
    expect(report.totalTf).toBe(240_000);
    expect(report.excludedTestCount).toBe(1);
    expect(report.excludedTestTotal).toBe(999_000);
    expect(report.unsyncedErpCount).toBe(2);
    expect(report.unsyncedErpTotal).toBe(75_000);
    expect(report.byTipe).toEqual([{ tipe: "AJ", cash: 160_000, tf: 240_000, total: 400_000 }]);
  });

  it("adds Tempo payments received on the report date without adding the Tempo invoice", () => {
    const tempoPayment = { ...basePayment, paymentDate: "2026-06-29", amountPaid: 125_000, paymentMethod: "TF" as const, tipeCodeSnapshot: "AJ" };
    const report = buildPaidSalesReport([{ ...baseSale, paymentMethod: "Tempo", total: 900_000 }], "2026-06-29", [tempoPayment]);
    expect(report.grandTotal).toBe(125_000);
    expect(report.tempoPaymentTotal).toBe(125_000);
    expect(report.byTipe).toEqual([{ tipe: "AJ", cash: 0, tf: 125_000, total: 125_000 }]);
  });

  it("subtracts a Tempo payment reversal on the reversal date", () => {
    const payment = { ...basePayment, paymentDate: "2026-06-28", amountPaid: 125_000, paymentMethod: "TF" as const, tipeCodeSnapshot: "AJ" };
    const reversal = { id: "TPR-1", tempoPaymentId: payment.id, reversalDate: "2026-06-29", amount: 125_000, reason: "Cancel", erpStatus: "reversed", createdByUserId: "U-1", createdByNameSnapshot: "Owner", createdAt: "2026-06-29T00:00:00.000Z" };
    const report = buildPaidSalesReport([], "2026-06-29", [payment], [reversal]);
    expect(report.grandTotal).toBe(-125_000);
    expect(report.tempoReversalTotal).toBe(125_000);
  });

  it("summarizes finance from active Tempo, monthly payments, and approved expenses only", () => {
    const report = buildFinanceReportSummary({
      month: "2026-06",
      tempo: [
        baseTempo,
        { ...baseTempo, id: "TMP-2", status: "paid", remainingAmount: 0 },
        { ...baseTempo, id: "TMP-3", status: "cancelled", remainingAmount: 50_000 },
        { ...baseTempo, id: "TMP-4", status: "written_off", remainingAmount: 60_000 }
      ],
      payments: [
        basePayment,
        { ...basePayment, id: "TPY-2", paymentDate: "2026-07-01", amountPaid: 200_000 }
      ],
      reversals: [{ id: "TPR-1", tempoPaymentId: basePayment.id, reversalDate: "2026-06-30", amount: 25_000, reason: "Cancel", erpStatus: "reversed", createdByUserId: "U-1", createdByNameSnapshot: "Owner", createdAt: "2026-06-30T00:00:00.000Z" }],
      expenses: [
        baseExpense,
        { ...baseExpense, id: "E-2", approvalStatus: "pending_approval", amount: 300_000 },
        { ...baseExpense, id: "E-3", approvalStatus: "rejected", amount: 400_000 },
        { ...baseExpense, id: "E-4", expenseDate: "2026-07-01", amount: 500_000 }
      ]
    });

    expect(report.openTempoTotal).toBe(400_000);
    expect(report.tempoPaymentTotal).toBe(75_000);
    expect(report.approvedExpenseTotal).toBe(75_000);
  });
});
