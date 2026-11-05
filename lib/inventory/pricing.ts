import "server-only";
import { prisma } from "@/lib/db/prisma";
import { InventoryError } from "./errors";
import { round2 } from "./math";

export const RMB_RATE_KEY = "inventory.rmb_rate";

/** Modal per satuan = harga RMB × kurs + biaya tambahan (Rp). */
export function costFromRmb(priceRmb: number, rate: number, extraCostIdr = 0) {
  return round2(priceRmb * rate + extraCostIdr);
}

export async function getRmbRate(): Promise<{ rate: number | null; updatedAt?: string; updatedBy?: string | null }> {
  const row = await prisma.appSetting.findUnique({ where: { key: RMB_RATE_KEY } });
  const rate = row ? Number(row.value) : NaN;
  return Number.isFinite(rate) && rate > 0
    ? { rate, updatedAt: row!.updatedAt.toISOString(), updatedBy: row!.updatedByNameSnapshot }
    : { rate: null };
}

/**
 * Simpan kurs RMB lalu hitung ulang harga modal semua barang yang punya harga RMB.
 * Harga jual dan nilai stok yang sudah tercatat (kartu stok/HPP rata-rata) tidak diubah.
 */
export async function setRmbRate(rate: number, actor?: { id?: string; name?: string }) {
  if (!Number.isFinite(rate) || rate <= 0) throw new InventoryError("VALIDATION", "Kurs RMB harus lebih dari 0.");
  const previous = await getRmbRate();
  const updatedProducts = await prisma.$transaction(async (tx) => {
    await tx.appSetting.upsert({
      where: { key: RMB_RATE_KEY },
      create: { key: RMB_RATE_KEY, value: String(rate), description: "Kurs RMB→IDR untuk harga modal inventory", updatedByUserId: actor?.id, updatedByNameSnapshot: actor?.name },
      update: { value: String(rate), updatedByUserId: actor?.id, updatedByNameSnapshot: actor?.name }
    });
    return tx.$executeRaw`
      UPDATE "InventoryProduct"
      SET "costPrice" = ROUND("priceRmb" * ${rate}::numeric + "extraCostIdr", 2), "updatedAt" = NOW()
      WHERE "priceRmb" IS NOT NULL`;
  });
  return { rate, previousRate: previous.rate, updatedProducts };
}

/** Isi costPrice otomatis bila harga RMB diberikan dan kurs sudah diatur. */
export async function applyRmbCost<T extends { priceRmb?: number | null; extraCostIdr?: number | null; costPrice?: number }>(
  data: T,
  existing?: { priceRmb: number | null; extraCostIdr: number }
): Promise<T> {
  const priceRmb = data.priceRmb !== undefined ? data.priceRmb : existing?.priceRmb;
  if (priceRmb == null) return data;
  const { rate } = await getRmbRate();
  if (!rate) return data;
  const extra = data.extraCostIdr ?? existing?.extraCostIdr ?? 0;
  return { ...data, costPrice: costFromRmb(priceRmb, rate, extra) };
}
