import "server-only";
import { MasterDataError, resolveSalesRekening } from "@/lib/business/masterData";
import type { SalePaymentSplit } from "@/lib/types/sales";

/**
 * Metode Split: nominal Cash masuk Kas Walk In, sisanya TF ke rekening yang dipilih.
 * Rekening utama penjualan = rekening TF, supaya filter rekening lama tetap menemukan nota ini.
 */
export async function buildSplitPayment(input: { splitCashAmount?: number; rekeningId?: string }, tipeId: string, total: number) {
  const cash = Math.round(Math.min(Math.max(0, Number(input.splitCashAmount) || 0), total));
  const transfer = Math.round(total - cash);
  if (cash <= 0 || transfer <= 0) {
    throw new MasterDataError("Untuk Split, isi nominal Cash lebih dari 0 dan lebih kecil dari total. Kalau lunas satu cara, pilih Cash atau TF.", "VALIDATION_ERROR");
  }
  const cashRekening = await resolveSalesRekening("Cash", tipeId);
  const transferRekening = await resolveSalesRekening("TF", tipeId, input.rekeningId);
  const paymentSplits: SalePaymentSplit[] = [
    { method: "Cash", amount: cash, rekeningId: cashRekening?.id, rekeningNameSnapshot: cashRekening?.name },
    { method: "TF", amount: transfer, rekeningId: transferRekening?.id, rekeningNameSnapshot: transferRekening?.name }
  ];
  return { paymentSplits, rekening: transferRekening };
}
