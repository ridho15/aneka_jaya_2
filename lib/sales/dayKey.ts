import type { Sale } from "@/lib/types/sales";

/** Tanggal (YYYY-MM-DD, WIB) untuk mengelompokkan nota per hari: dari jam transaksi, atau tanggal jual bila kosong. */
export function saleDayKey(sale: Pick<Sale, "transactionAt" | "saleDate">) {
  if (!sale.transactionAt) return sale.saleDate;
  const date = new Date(sale.transactionAt);
  return Number.isNaN(date.getTime()) ? sale.saleDate : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
}
