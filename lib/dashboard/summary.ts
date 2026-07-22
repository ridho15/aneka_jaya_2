import type { AuditLog } from "@/lib/audit/store";
import type { Expense } from "@/lib/types/expenses";
import type { Product } from "@/lib/types/product";
import type { Sale } from "@/lib/types/sales";
import type { TempoPayment, TempoPaymentReversal } from "@/lib/tempo/store";

export type MonthlyPerformance = {
  key: string;
  label: string;
  sales: number;
  expenses: number;
};

export type CategorySummary = {
  label: string;
  value: number;
  percentage: number;
};

export type DashboardSalesMetrics = {
  paidSales: Sale[];
  salesThisMonth: Sale[];
  salesToday: Sale[];
  receivedThisMonth: Sale[];
  receivedToday: Sale[];
  totalThisMonth: number;
  totalToday: number;
  totalReceivedThisMonth: number;
  totalReceivedToday: number;
};

export type DashboardProductKpi = {
  value: string;
  change: string;
};

export type DashboardOperationalProfitSummary = {
  grossProfitPercent: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  todayRevenue: number;
  todayExpenses: number;
  grossProfit: number;
  nettProfit: number;
  monthlySalesCount: number;
  todaySalesCount: number;
};

export type DashboardSalesFilters = {
  from?: string;
  to?: string;
  paymentMethod?: string;
  rekening?: string;
};

export type PaymentBreakdownEntry = {
  label: string;
  value: number;
  percentage: number;
  rekeningId?: string;
  paymentMethod: "Cash" | "TF";
};

export type PaymentBreakdown = {
  total: number;
  cash: PaymentBreakdownEntry;
  transfers: PaymentBreakdownEntry[];
};

function monthKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthStart(value: string | Date) {
  const key = monthKey(value);
  if (!key) return null;
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function monthsBetween(start: Date, end: Date) {
  const months: MonthlyPerformance[] = [];
  for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor = addMonths(cursor, 1)) {
    months.push({
      key: monthKey(cursor) as string,
      label: new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" }).format(cursor),
      sales: 0,
      expenses: 0
    });
  }
  return months;
}

export function formatDashboardMoney(value: number) {
  const amount = Number.isFinite(value) ? value : 0;
  if (Math.abs(amount) >= 1_000_000) return `Rp ${Math.round(amount / 1_000).toLocaleString("id-ID")} jt`;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

export function buildDashboardSalesMetrics(sales: Sale[], todayKey: string, monthKeyValue: string): DashboardSalesMetrics {
  const paidSales = sales.filter((sale) => sale.approvalStatus === "approved");
  const salesThisMonth = paidSales.filter((sale) => sale.saleDate?.startsWith(monthKeyValue));
  const salesToday = paidSales.filter((sale) => sale.saleDate === todayKey);
  const receivedThisMonth = salesThisMonth.filter((sale) => sale.paymentMethod === "Cash" || sale.paymentMethod === "TF");
  const receivedToday = salesToday.filter((sale) => sale.paymentMethod === "Cash" || sale.paymentMethod === "TF");
  return {
    paidSales,
    salesThisMonth,
    salesToday,
    receivedThisMonth,
    receivedToday,
    totalThisMonth: salesThisMonth.reduce((sum, sale) => sum + (sale.total || 0), 0),
    totalToday: salesToday.reduce((sum, sale) => sum + (sale.total || 0), 0),
    totalReceivedThisMonth: receivedThisMonth.reduce((sum, sale) => sum + (sale.total || 0), 0),
    totalReceivedToday: receivedToday.reduce((sum, sale) => sum + (sale.total || 0), 0)
  };
}

function typeCode(row: { tipeId?: string; tipeCodeSnapshot?: string }) {
  return (row.tipeCodeSnapshot || row.tipeId || "").trim().toUpperCase();
}

function isOperationalSale(row: Pick<Sale, "tipeId" | "tipeCodeSnapshot" | "syncTarget">) {
  return typeCode(row) !== "AJ";
}

function isOperationalExpense(row: Pick<Expense, "tipeId" | "tipeCodeSnapshot">) {
  return typeCode(row) !== "AJ";
}

export function buildOperationalProfitSummary(sales: Sale[], expenses: Expense[], todayKey: string, monthKeyValue: string, grossProfitPercent = 0): DashboardOperationalProfitSummary {
  const percent = Number.isFinite(grossProfitPercent) ? Math.min(100, Math.max(0, grossProfitPercent)) : 0;
  const approvedOperationalSales = sales.filter((sale) => sale.approvalStatus === "approved" && isOperationalSale(sale));
  const approvedOperationalExpenses = expenses.filter((expense) => expense.approvalStatus === "approved" && isOperationalExpense(expense));
  const monthlySales = approvedOperationalSales.filter((sale) => sale.saleDate?.startsWith(monthKeyValue));
  const todaySales = approvedOperationalSales.filter((sale) => sale.saleDate === todayKey);
  const monthlyExpenses = approvedOperationalExpenses.filter((expense) => expense.expenseDate?.startsWith(monthKeyValue));
  const todayExpenses = approvedOperationalExpenses.filter((expense) => expense.expenseDate === todayKey);
  const monthlyRevenue = monthlySales.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
  const monthlyExpenseTotal = monthlyExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const grossProfit = monthlyRevenue * percent / 100;
  return {
    grossProfitPercent: percent,
    monthlyRevenue,
    monthlyExpenses: monthlyExpenseTotal,
    todayRevenue: todaySales.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0),
    todayExpenses: todayExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0),
    grossProfit,
    nettProfit: grossProfit - monthlyExpenseTotal,
    monthlySalesCount: monthlySales.length,
    todaySalesCount: todaySales.length
  };
}

export function dashboardDataSourceNotice(appMode = process.env.NEXT_PUBLIC_APP_MODE) {
  return appMode === "production" ? undefined : "Mode development: dashboard dapat membaca gabungan DB dan JSON lokal.";
}

export function productKpi(success: boolean, count: number, message?: string): DashboardProductKpi {
  if (!success) return { value: "Tidak tersedia", change: message || "Produk ERP belum tersedia" };
  return { value: `${count} item`, change: "Semua gudang terpantau" };
}

export function filterDashboardSales(sales: Sale[], filters: DashboardSalesFilters): Sale[] {
  return sales.filter((sale) => {
    if (filters.from && sale.saleDate < filters.from) return false;
    if (filters.to && sale.saleDate > filters.to) return false;
    if (filters.paymentMethod && sale.paymentMethod !== filters.paymentMethod) return false;
    if (filters.rekening && (sale.rekeningId || sale.rekeningNameSnapshot || "") !== filters.rekening) return false;
    return true;
  });
}

function paymentPercentage(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

export function buildPaymentBreakdown(sales: Sale[], rekeningLabels: Record<string, string> = {}, tempoPayments: TempoPayment[] = [], tempoReversals: TempoPaymentReversal[] = []): PaymentBreakdown {
  const paidSales = sales.filter((sale) => sale.approvalStatus === "approved" && (sale.paymentMethod === "Cash" || sale.paymentMethod === "TF"));
  const paymentById = new Map(tempoPayments.map((payment) => [payment.id, payment]));
  const cashReversal = tempoReversals.filter((reversal) => paymentById.get(reversal.tempoPaymentId)?.paymentMethod === "Cash").reduce((sum, reversal) => sum + reversal.amount, 0);
  const cashValue = paidSales.filter((sale) => sale.paymentMethod === "Cash").reduce((sum, sale) => sum + (Number(sale.total) || 0), 0) + tempoPayments.filter((payment) => payment.paymentMethod === "Cash").reduce((sum, payment) => sum + payment.amountPaid, 0) - cashReversal;
  const transferTotals = new Map<string, { label: string; rekeningId?: string; value: number }>();

  for (const sale of paidSales) {
    if (sale.paymentMethod !== "TF") continue;
    const label = (sale.rekeningId && rekeningLabels[sale.rekeningId]) || sale.rekeningNameSnapshot || sale.transferAccount || "TF tanpa rekening";
    const key = sale.rekeningId || sale.rekeningNameSnapshot || sale.transferAccount || label;
    const existing = transferTotals.get(key);
    transferTotals.set(key, {
      label,
      rekeningId: sale.rekeningId || sale.rekeningNameSnapshot || sale.transferAccount,
      value: (existing?.value || 0) + (Number(sale.total) || 0)
    });
  }
  for (const payment of tempoPayments) {
    if (payment.paymentMethod !== "TF") continue;
    const label = rekeningLabels[payment.rekeningId] || payment.rekeningNameSnapshot || "TF tanpa rekening";
    const key = payment.rekeningId || label;
    const existing = transferTotals.get(key);
    transferTotals.set(key, { label, rekeningId: payment.rekeningId, value: (existing?.value || 0) + payment.amountPaid });
  }
  for (const reversal of tempoReversals) {
    const payment = paymentById.get(reversal.tempoPaymentId);
    if (!payment || payment.paymentMethod !== "TF") continue;
    const label = rekeningLabels[payment.rekeningId] || payment.rekeningNameSnapshot || "TF tanpa rekening";
    const key = payment.rekeningId || label;
    const existing = transferTotals.get(key);
    transferTotals.set(key, { label, rekeningId: payment.rekeningId, value: (existing?.value || 0) - reversal.amount });
  }

  const total = cashValue + Array.from(transferTotals.values()).reduce((sum, row) => sum + row.value, 0);
  return {
    total,
    cash: { label: "Cash", value: cashValue, percentage: paymentPercentage(cashValue, total), rekeningId: "cash", paymentMethod: "Cash" },
    transfers: Array.from(transferTotals.values())
      .map((row) => ({ label: row.label, value: row.value, percentage: paymentPercentage(row.value, total), rekeningId: row.rekeningId, paymentMethod: "TF" as const }))
      .sort((a, b) => b.value - a.value)
  };
}

export function buildMonthlyPerformance(sales: Sale[], expenses: Expense[], now = new Date(), range: { from?: string; to?: string } = {}): MonthlyPerformance[] {
  const end = range.to ? monthStart(range.to) : new Date(now.getFullYear(), now.getMonth(), 1);
  const start = range.from ? monthStart(range.from) : end ? addMonths(end, -5) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const months = start && end && start <= end ? monthsBetween(start, end) : monthsBetween(new Date(now.getFullYear(), now.getMonth() - 5, 1), new Date(now.getFullYear(), now.getMonth(), 1));
  const byMonth = new Map(months.map((month) => [month.key, month]));

  for (const sale of sales) {
    if (sale.approvalStatus !== "approved") continue;
    const month = byMonth.get(monthKey(sale.saleDate) || "");
    if (month) month.sales += Number(sale.total) || 0;
  }
  for (const expense of expenses) {
    if (expense.approvalStatus !== "approved") continue;
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const month = byMonth.get(monthKey(expense.expenseDate) || "");
    if (month) month.expenses += amount;
  }
  return months;
}

export function buildCategorySummary(sales: Sale[], products: Product[]): CategorySummary[] {
  const productCategories = new Map<string, string>();
  for (const product of products) {
    for (const reference of [product.id, product.code, product.name]) {
      if (reference) productCategories.set(reference.trim().toLowerCase(), product.category || "Tanpa kategori");
    }
  }

  const totals = new Map<string, number>();
  for (const sale of sales) {
    if (sale.approvalStatus !== "approved") continue;
    for (const item of sale.items) {
      const category = productCategories.get(item.productRef.trim().toLowerCase()) || "Tanpa kategori";
      const amount = Math.max(0, item.quantity * item.unitPrice - (item.discount || 0));
      totals.set(category, (totals.get(category) || 0) + amount);
    }
  }
  const entries = Array.from(totals.entries());
  const grandTotal = entries.reduce((sum, [, value]) => sum + value, 0);
  if (grandTotal <= 0) return [];
  return entries
    .map(([label, value]) => ({ label, value, percentage: (value / grandTotal) * 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

export function activityText(entry: AuditLog) {
  const entityLabels: Partial<Record<AuditLog["entityType"], string>> = {
    sales: "Penjualan",
    expense: "Pengeluaran",
    product: "Barang",
    approval: "Approval",
    tempo: "Tempo",
    whatsapp_report: "WhatsApp"
  };
  const entity = entityLabels[entry.entityType] || entry.entityType;
  return `${entity} ${entry.action.replaceAll("_", " ")} oleh ${entry.userNameSnapshot}`;
}

export function activityStatusText(entry: AuditLog) {
  if (entry.action === "cancel") return "Dibatalkan";
  if (entry.action === "reject") return "Ditolak";
  if (["create", "update", "mark_paid", "retry_sync"].includes(entry.action)) return "Tercatat";
  return "Audit";
}
