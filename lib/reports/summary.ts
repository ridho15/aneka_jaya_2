import type { Expense } from "@/lib/types/expenses";
import type { Sale } from "@/lib/types/sales";
import type { TempoPayment, TempoPaymentReversal, TempoReceivable } from "@/lib/tempo/store";

export type PaidSalesReport = {
  reportDate: string;
  paidSales: Sale[];
  grandTotal: number;
  totalCash: number;
  totalTf: number;
  byTipe: Array<{ tipe: string; cash: number; tf: number; total: number }>;
  excludedTestCount: number;
  excludedTestTotal: number;
  unsyncedErpCount: number;
  unsyncedErpTotal: number;
  tempoPayments: Array<TempoPayment & { customerName?: string; salesId?: string; tipeCodeSnapshot?: string }>;
  tempoPaymentTotal: number;
  tempoReversals: TempoPaymentReversal[];
  tempoReversalTotal: number;
};

export type FinanceReportSummary = {
  month: string;
  openTempo: TempoReceivable[];
  openTempoTotal: number;
  tempoPayments: TempoPayment[];
  tempoPaymentTotal: number;
  tempoReversals: TempoPaymentReversal[];
  tempoReversalTotal: number;
  approvedExpenses: Expense[];
  approvedExpenseTotal: number;
  operationalExpenses?: Expense[];
  operationalExpenseTotal?: number;
  kasbonDisbursed?: Expense[];
  kasbonDisbursedTotal?: number;
  salaryExpenses?: Expense[];
  salaryExpenseTotal?: number;
};

const finalTempoStatuses = ["paid", "cancelled", "written_off"];
const isPaidPaymentMethod = (value: string): value is "Cash" | "TF" => value === "Cash" || value === "TF";

export function buildPaidSalesReport(sales: Sale[], reportDate: string, tempoPaymentsInput: Array<TempoPayment & { customerName?: string; salesId?: string; tipeCodeSnapshot?: string }> = [], tempoReversalsInput: TempoPaymentReversal[] = []): PaidSalesReport {
  const eligibleSales = sales.filter((sale) => sale.saleDate === reportDate && isPaidPaymentMethod(sale.paymentMethod) && (!sale.approvalStatus || sale.approvalStatus === "approved"));
  const excludedTestSales = eligibleSales.filter((sale) => sale.isTestTransaction === true);
  const paidSales = eligibleSales.filter((sale) => sale.isTestTransaction !== true);
  const byTipeMap = new Map<string, { tipe: string; cash: number; tf: number; total: number }>();
  let totalCash = 0;
  let totalTf = 0;
  let unsyncedErpCount = 0;
  let unsyncedErpTotal = 0;
  const tempoPayments = tempoPaymentsInput.filter((payment) => payment.paymentDate === reportDate);
  const tempoReversals = tempoReversalsInput.filter((reversal) => reversal.reversalDate === reportDate);
  const paymentById = new Map(tempoPaymentsInput.map((payment) => [payment.id, payment]));

  for (const sale of paidSales) {
    const amount = Number(sale.total) || 0;
    if (sale.paymentMethod === "Cash") totalCash += amount;
    if (sale.paymentMethod === "TF") totalTf += amount;
    if (sale.syncTarget === "erp" && (sale.syncStatus === "pending" || sale.syncStatus === "failed")) {
      unsyncedErpCount += 1;
      unsyncedErpTotal += amount;
    }
    const tipe = sale.tipeCodeSnapshot || "W";
    const current = byTipeMap.get(tipe) || { tipe, cash: 0, tf: 0, total: 0 };
    if (sale.paymentMethod === "Cash") current.cash += amount;
    if (sale.paymentMethod === "TF") current.tf += amount;
    current.total += amount;
    byTipeMap.set(tipe, current);
  }
  for (const payment of tempoPayments) {
    if (payment.paymentMethod === "Cash") totalCash += payment.amountPaid;
    if (payment.paymentMethod === "TF") totalTf += payment.amountPaid;
    const tipe = payment.tipeCodeSnapshot || "W";
    const current = byTipeMap.get(tipe) || { tipe, cash: 0, tf: 0, total: 0 };
    if (payment.paymentMethod === "Cash") current.cash += payment.amountPaid;
    if (payment.paymentMethod === "TF") current.tf += payment.amountPaid;
    current.total += payment.amountPaid;
    byTipeMap.set(tipe, current);
  }
  for (const reversal of tempoReversals) {
    const payment = paymentById.get(reversal.tempoPaymentId);
    if (!payment) continue;
    if (payment.paymentMethod === "Cash") totalCash -= reversal.amount;
    if (payment.paymentMethod === "TF") totalTf -= reversal.amount;
    const tipe = payment.tipeCodeSnapshot || "W";
    const current = byTipeMap.get(tipe) || { tipe, cash: 0, tf: 0, total: 0 };
    if (payment.paymentMethod === "Cash") current.cash -= reversal.amount;
    if (payment.paymentMethod === "TF") current.tf -= reversal.amount;
    current.total -= reversal.amount;
    byTipeMap.set(tipe, current);
  }

  return {
    reportDate,
    paidSales,
    grandTotal: totalCash + totalTf,
    totalCash,
    totalTf,
    byTipe: Array.from(byTipeMap.values()).sort((a, b) => a.tipe.localeCompare(b.tipe)),
    excludedTestCount: excludedTestSales.length,
    excludedTestTotal: excludedTestSales.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0),
    unsyncedErpCount,
    unsyncedErpTotal,
    tempoPayments,
    tempoPaymentTotal: tempoPayments.reduce((sum, payment) => sum + payment.amountPaid, 0),
    tempoReversals,
    tempoReversalTotal: tempoReversals.reduce((sum, reversal) => sum + reversal.amount, 0)
  };
}

export function buildFinanceReportSummary(input: {
  month: string;
  tempo: TempoReceivable[];
  payments: TempoPayment[];
  reversals?: TempoPaymentReversal[];
  expenses: Expense[];
}): FinanceReportSummary {
  const openTempo = input.tempo.filter((row) => !finalTempoStatuses.includes(row.status));
  const tempoPayments = input.payments.filter((row) => row.paymentDate.startsWith(input.month));
  const tempoReversals = (input.reversals || []).filter((row) => row.reversalDate.startsWith(input.month));
  const approvedExpenses = input.expenses.filter((row) => row.approvalStatus === "approved" && row.expenseDate.startsWith(input.month));

  const kasbonDisbursed = approvedExpenses.filter((row) => row.categoryCode === "employee_loan" || row.categoryCode === "operational_advance");
  const salaryExpenses = approvedExpenses.filter((row) => row.categoryCode === "salary");
  const operationalExpenses = approvedExpenses.filter((row) => row.categoryCode !== "employee_loan" && row.categoryCode !== "operational_advance" && row.categoryCode !== "salary");

  return {
    month: input.month,
    openTempo,
    openTempoTotal: openTempo.reduce((sum, row) => sum + row.remainingAmount, 0),
    tempoPayments,
    tempoPaymentTotal: tempoPayments.reduce((sum, row) => sum + row.amountPaid, 0) - tempoReversals.reduce((sum, row) => sum + row.amount, 0),
    tempoReversals,
    tempoReversalTotal: tempoReversals.reduce((sum, row) => sum + row.amount, 0),
    approvedExpenses,
    approvedExpenseTotal: approvedExpenses.reduce((sum, row) => sum + row.amount, 0),
    operationalExpenses,
    operationalExpenseTotal: operationalExpenses.reduce((sum, row) => sum + row.amount, 0),
    kasbonDisbursed,
    kasbonDisbursedTotal: kasbonDisbursed.reduce((sum, row) => sum + row.amount, 0),
    salaryExpenses,
    salaryExpenseTotal: salaryExpenses.reduce((sum, row) => sum + row.amount, 0)
  };
}
