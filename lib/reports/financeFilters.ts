import type { Expense, TempoReceivable } from "@/lib/types/reports";

export type SearchParams = Record<string, string | string[] | undefined>;

export const FINANCE_PAGE_SIZE = 10;

export function valueOf(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function toPage(value?: string): number {
  const page = Number(value || "1");
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

export function pageHref(
  params: SearchParams,
  key: "tempoPage" | "expensePage",
  page: number,
): string {
  const next = new URLSearchParams();
  for (const [paramKey, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && paramKey !== key) next.set(paramKey, value);
  }
  next.set(key, String(page));
  return `/reports/finance?${next.toString()}`;
}

export function resetTempoFilterHref(params: SearchParams): string {
  const next = new URLSearchParams();
  for (const [paramKey, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (
      value &&
      !["tempoKeyword", "tempoTipe", "tempoStatus", "tempoPage"].includes(paramKey)
    ) {
      next.set(paramKey, value);
    }
  }
  const qs = next.toString();
  return qs ? `/reports/finance?${qs}` : "/reports/finance";
}

export function resetExpenseFilterHref(params: SearchParams): string {
  const next = new URLSearchParams();
  for (const [paramKey, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (
      value &&
      !["expenseKeyword", "expenseTipe", "expenseRekening", "expensePage"].includes(paramKey)
    ) {
      next.set(paramKey, value);
    }
  }
  const qs = next.toString();
  return qs ? `/reports/finance?${qs}` : "/reports/finance";
}

export interface TempoFilterCriteria {
  keyword?: string;
  tipe?: string;
  status?: string;
}

export function filterOpenTempo(
  items: TempoReceivable[],
  criteria: TempoFilterCriteria,
): TempoReceivable[] {
  const keyword = (criteria.keyword || "").trim().toLowerCase();
  const tipe = criteria.tipe || "";
  const status = criteria.status || "";

  return items.filter((row) => {
    if (keyword) {
      const matchCustomer = row.customerName?.toLowerCase().includes(keyword);
      const matchSales = row.salesId?.toLowerCase().includes(keyword);
      if (!matchCustomer && !matchSales) return false;
    }
    if (tipe && row.tipeCodeSnapshot !== tipe) return false;
    if (status && row.status !== status) return false;
    return true;
  });
}

export interface ExpenseFilterCriteria {
  keyword?: string;
  tipe?: string;
  rekening?: string;
}

export function filterApprovedExpenses(
  items: Expense[],
  criteria: ExpenseFilterCriteria,
): Expense[] {
  const keyword = (criteria.keyword || "").trim().toLowerCase();
  const tipe = criteria.tipe || "";
  const rekening = criteria.rekening || "";

  return items.filter((row) => {
    if (keyword) {
      const matchVendor = row.vendorName?.toLowerCase().includes(keyword);
      const matchCategory = row.category?.toLowerCase().includes(keyword);
      const matchNote = row.note?.toLowerCase().includes(keyword);
      if (!matchVendor && !matchCategory && !matchNote) return false;
    }
    if (tipe && row.tipeCodeSnapshot !== tipe) return false;
    if (rekening) {
      const matchId = row.rekeningId === rekening;
      const matchName = row.rekeningNameSnapshot === rekening;
      if (!matchId && !matchName) return false;
    }
    return true;
  });
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number = FINANCE_PAGE_SIZE,
): {
  items: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
} {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pagedItems = items.slice(start, start + pageSize);

  return {
    items: pagedItems,
    currentPage,
    totalPages,
    totalItems,
  };
}
