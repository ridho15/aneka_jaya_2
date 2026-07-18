import type { RekeningAccount } from "@/lib/business/masterData";
import type { Sale } from "@/lib/types/sales";

export function salesRekeningLabel(sale: Pick<Sale, "rekeningId" | "rekeningNameSnapshot" | "transferAccount">, rekenings: Pick<RekeningAccount, "id" | "name">[] = []) {
  return sale.rekeningNameSnapshot
    || rekenings.find((rekening) => rekening.id === sale.rekeningId)?.name
    || sale.transferAccount
    || sale.rekeningId
    || "—";
}
