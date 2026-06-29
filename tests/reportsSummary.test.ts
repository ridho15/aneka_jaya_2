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
      { ...baseSale, id: "S-3", paymentMethod: "Tempo", total: 300_000 },
      { ...baseSale, id: "S-4", paymentMethod: "Cash", approvalStatus: "pending_approval", total: 400_000 },
      { ...baseSale, id: "S-5", saleDate: "2026-06-28", total: 500_000 }
    ], "2026-06-29");

    expect(report.grandTotal).toBe(300_000);
    expect(report.totalCash).toBe(100_000);
    expect(report.totalTf).toBe(200_000);
    expect(report.byTipe).toEqual([{ tipe: "AJ", cash: 100_000, tf: 200_000, total: 300_000 }]);
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
      expenses: [
        baseExpense,
        { ...baseExpense, id: "E-2", approvalStatus: "pending_approval", amount: 300_000 },
        { ...baseExpense, id: "E-3", approvalStatus: "rejected", amount: 400_000 },
        { ...baseExpense, id: "E-4", expenseDate: "2026-07-01", amount: 500_000 }
      ]
    });

    expect(report.openTempoTotal).toBe(400_000);
    expect(report.tempoPaymentTotal).toBe(100_000);
    expect(report.approvedExpenseTotal).toBe(75_000);
  });
});
