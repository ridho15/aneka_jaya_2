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

function monthKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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
