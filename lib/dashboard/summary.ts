import type { AuditLog } from "@/lib/audit/store";
import type { Expense } from "@/lib/types/expenses";
import type { Product } from "@/lib/types/product";
import type { Sale } from "@/lib/types/sales";

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
  totalThisMonth: number;
  totalToday: number;
};

export type DashboardProductKpi = {
  value: string;
  change: string;
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

export function formatDashboardMoney(value: number) {
  const amount = Number.isFinite(value) ? value : 0;
  if (Math.abs(amount) >= 1_000_000) return `Rp ${Math.round(amount / 1_000).toLocaleString("id-ID")} jt`;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

export function buildDashboardSalesMetrics(sales: Sale[], todayKey: string, monthKeyValue: string): DashboardSalesMetrics {
  const paidSales = sales.filter((sale) => sale.approvalStatus === "approved");
  const salesThisMonth = paidSales.filter((sale) => sale.saleDate?.startsWith(monthKeyValue));
  const salesToday = paidSales.filter((sale) => sale.saleDate === todayKey);
  return {
    paidSales,
    salesThisMonth,
    salesToday,
    totalThisMonth: salesThisMonth.reduce((sum, sale) => sum + (sale.total || 0), 0),
    totalToday: salesToday.reduce((sum, sale) => sum + (sale.total || 0), 0)
  };
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

export function buildPaymentBreakdown(sales: Sale[], rekeningLabels: Record<string, string> = {}): PaymentBreakdown {
  const paidSales = sales.filter((sale) => sale.approvalStatus === "approved" && (sale.paymentMethod === "Cash" || sale.paymentMethod === "TF"));
  const cashValue = paidSales.filter((sale) => sale.paymentMethod === "Cash").reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
  const transferTotals = new Map<string, number>();

  for (const sale of paidSales) {
    if (sale.paymentMethod !== "TF") continue;
    const label = (sale.rekeningId && rekeningLabels[sale.rekeningId]) || sale.rekeningNameSnapshot || sale.transferAccount || "TF tanpa rekening";
    transferTotals.set(label, (transferTotals.get(label) || 0) + (Number(sale.total) || 0));
  }

  const total = cashValue + Array.from(transferTotals.values()).reduce((sum, value) => sum + value, 0);
  return {
    total,
    cash: { label: "Cash", value: cashValue, percentage: paymentPercentage(cashValue, total) },
    transfers: Array.from(transferTotals.entries())
      .map(([label, value]) => ({ label, value, percentage: paymentPercentage(value, total) }))
      .sort((a, b) => b.value - a.value)
  };
}

export function buildMonthlyPerformance(sales: Sale[], expenses: Expense[], now = new Date()): MonthlyPerformance[] {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      key: monthKey(date) as string,
      label: new Intl.DateTimeFormat("id-ID", { month: "short" }).format(date),
      sales: 0,
      expenses: 0
    };
  });
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
