/** Akun COA yang bisa dipilih di form Pengeluaran. */
export type ExpenseCoaOption = { code: string; name: string };

/** Pilihan COA lama (sebelum COA rinci) dan akun yang dipakai saat dijurnal. */
export const LEGACY_EXPENSE_COA: Record<string, string> = {
  Kas: "6-1001",
  Operasional: "6-1001",
  Transport: "6-1003",
  Pembelian: "6-1001"
};

/** HPP & selisih kurs dijurnal otomatis; gaji punya kategori sendiri. */
const SYSTEM_ONLY = new Set(["5-1001", "6-1002", "6-1006"]);

export function selectableExpenseAccounts<T extends { code: string; name: string; category: string; isActive: boolean }>(accounts: T[]): ExpenseCoaOption[] {
  return accounts
    .filter((a) => a.isActive && a.category === "EXPENSE" && !SYSTEM_ONLY.has(a.code))
    .map((a) => ({ code: a.code, name: a.name }));
}

export const coaLabel = (option: ExpenseCoaOption) => `${option.code} ${option.name}`;

/** Akun debit untuk pengeluaran operasional: kode COA yang dipilih, atau padanan pilihan lama. */
export function expenseDebitAccountCode(coaId?: string | null) {
  const value = (coaId || "").trim();
  const code = value.match(/^\d+-\d+/)?.[0];
  if (code) return code;
  return LEGACY_EXPENSE_COA[value] || "6-1001";
}

/** Pengeluaran yang bukan biaya laba rugi: pelunasan barang dagang (HPP dicatat saat terjual), uang muka, kasbon, aset tetap. */
const NOT_PROFIT_EXPENSE = new Set(["goods_purchase", "purchase_advance", "employee_loan", "operational_advance"]);

export function isProfitExpense(expense: { categoryCode?: string | null; amount?: number | null }, capitalizationThreshold = 1_000_000) {
  if (NOT_PROFIT_EXPENSE.has(expense.categoryCode || "")) return false;
  if (expense.categoryCode === "equipment") return Number(expense.amount) < capitalizationThreshold;
  return true;
}
