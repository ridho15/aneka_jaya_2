import type { Sale, SalePaymentSplit } from "@/lib/types/sales";

export type PaymentPart = SalePaymentSplit & { transferAccount?: string };

/** Metode yang uangnya langsung diterima (bukan tempo). */
export function isPaidPaymentMethod(method?: string) {
  return method === "Cash" || method === "TF" || method === "Split";
}

/** Bagian uang masuk sebuah penjualan per metode & rekening. Split dipecah sesuai isiannya. */
export function salePaymentParts(sale: Pick<Sale, "paymentMethod" | "total" | "rekeningId" | "rekeningNameSnapshot" | "transferAccount" | "paymentSplits">): PaymentPart[] {
  const total = Number(sale.total) || 0;
  if (sale.paymentMethod === "Cash" || sale.paymentMethod === "TF") {
    return [{ method: sale.paymentMethod, amount: total, rekeningId: sale.rekeningId, rekeningNameSnapshot: sale.rekeningNameSnapshot, transferAccount: sale.transferAccount }];
  }
  if (sale.paymentMethod === "Split") {
    return (sale.paymentSplits || []).filter((part) => Number(part.amount) > 0).map((part) => ({ ...part, amount: Number(part.amount) }));
  }
  return [];
}

/** Baca kolom JSON paymentSplits dari database dengan aman. */
export function parsePaymentSplits(value: unknown): SalePaymentSplit[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = value
    .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object")
    .filter((v) => v.method === "Cash" || v.method === "TF")
    .map((v) => ({
      method: v.method as "Cash" | "TF",
      amount: Number(v.amount) || 0,
      rekeningId: typeof v.rekeningId === "string" ? v.rekeningId : undefined,
      rekeningNameSnapshot: typeof v.rekeningNameSnapshot === "string" ? v.rekeningNameSnapshot : undefined
    }));
  return parts.length ? parts : undefined;
}
