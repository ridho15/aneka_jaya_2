import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { InventoryError } from "./errors";
import { round2 } from "./math";

export const RMB_RATE_KEY = "inventory.rmb_rate";
export const CBM_RATE_KEY = "inventory.cbm_rate";

/** Modal per satuan = harga RMB × kurs + CBM per satuan × tarif CBM + biaya tambahan (Rp). */
export function costFromRmb(priceRmb: number, rate: number, extraCostIdr = 0, cbmPerUnit = 0, cbmRate = 0) {
  return round2(priceRmb * rate + (cbmPerUnit || 0) * (cbmRate || 0) + extraCostIdr);
}

async function readRate(key: string) {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  const rate = row ? Number(row.value) : NaN;
  return Number.isFinite(rate) && rate > 0
    ? { rate, updatedAt: row!.updatedAt.toISOString(), updatedBy: row!.updatedByNameSnapshot }
    : { rate: null as number | null };
}

export async function getRmbRate(): Promise<{ rate: number | null; updatedAt?: string; updatedBy?: string | null }> {
  return readRate(RMB_RATE_KEY);
}

/** Tarif ongkir laut per CBM (Rp). */
export async function getCbmRate(): Promise<{ rate: number | null; updatedAt?: string; updatedBy?: string | null }> {
  return readRate(CBM_RATE_KEY);
}

/**
 * Hitung ulang harga modal semua barang yang punya harga RMB dengan kurs & tarif CBM saat ini.
 * Barang dengan tarif CBM khusus memakai tarif khususnya. Harga jual dan nilai stok tercatat tidak diubah.
 */
async function recomputeCosts(tx: Prisma.TransactionClient, rmbRate: number | null, cbmRate: number | null) {
  if (!rmbRate) return 0;
  return tx.$executeRaw`
    UPDATE "InventoryProduct"
    SET "costPrice" = ROUND(
      "priceRmb" * ${rmbRate}::numeric
      + COALESCE("cbmPerUnit", 0) * COALESCE("cbmRateIdr", ${cbmRate ?? 0}::numeric)
      + "extraCostIdr", 2),
      "updatedAt" = NOW()
    WHERE "priceRmb" IS NOT NULL`;
}

async function saveRate(key: string, description: string, rate: number, actor?: { id?: string; name?: string }) {
  if (!Number.isFinite(rate) || rate <= 0) throw new InventoryError("VALIDATION", "Nilai harus lebih dari 0.");
  return prisma.$transaction(async (tx) => {
    await tx.appSetting.upsert({
      where: { key },
      create: { key, value: String(rate), description, updatedByUserId: actor?.id, updatedByNameSnapshot: actor?.name },
      update: { value: String(rate), updatedByUserId: actor?.id, updatedByNameSnapshot: actor?.name }
    });
    const rmb = key === RMB_RATE_KEY ? rate : (await tx.appSetting.findUnique({ where: { key: RMB_RATE_KEY } }))?.value;
    const cbm = key === CBM_RATE_KEY ? rate : (await tx.appSetting.findUnique({ where: { key: CBM_RATE_KEY } }))?.value;
    const rmbRate = Number(rmb) > 0 ? Number(rmb) : null;
    const cbmRate = Number(cbm) > 0 ? Number(cbm) : null;
    return recomputeCosts(tx, rmbRate, cbmRate);
  });
}

/** Simpan kurs RMB lalu hitung ulang harga modal semua barang yang punya harga RMB. */
export async function setRmbRate(rate: number, actor?: { id?: string; name?: string }) {
  const previous = await getRmbRate();
  const updatedProducts = await saveRate(RMB_RATE_KEY, "Kurs RMB→IDR untuk harga modal inventory", rate, actor);
  return { rate, previousRate: previous.rate, updatedProducts };
}

/** Simpan tarif CBM global lalu hitung ulang modal barang yang tidak punya tarif CBM khusus. */
export async function setCbmRate(rate: number, actor?: { id?: string; name?: string }) {
  const previous = await getCbmRate();
  const updatedProducts = await saveRate(CBM_RATE_KEY, "Tarif ongkir per CBM (Rp) untuk harga modal inventory", rate, actor);
  return { rate, previousRate: previous.rate, updatedProducts };
}

type CostInputs = { priceRmb?: number | null; extraCostIdr?: number | null; cbmPerUnit?: number | null; cbmRateIdr?: number | null; costPrice?: number };

/** Isi costPrice otomatis bila harga RMB diberikan dan kurs sudah diatur. */
export async function applyRmbCost<T extends CostInputs>(
  data: T,
  existing?: { priceRmb: number | null; extraCostIdr: number; cbmPerUnit?: number | null; cbmRateIdr?: number | null }
): Promise<T> {
  const priceRmb = data.priceRmb !== undefined ? data.priceRmb : existing?.priceRmb;
  if (priceRmb == null) return data;
  const [{ rate }, { rate: globalCbm }] = await Promise.all([getRmbRate(), getCbmRate()]);
  if (!rate) return data;
  const extra = data.extraCostIdr ?? existing?.extraCostIdr ?? 0;
  const cbmPerUnit = data.cbmPerUnit !== undefined ? data.cbmPerUnit : existing?.cbmPerUnit;
  const cbmRate = (data.cbmRateIdr !== undefined ? data.cbmRateIdr : existing?.cbmRateIdr) ?? globalCbm ?? 0;
  return { ...data, costPrice: costFromRmb(priceRmb, rate, extra, cbmPerUnit ?? 0, cbmRate) };
}
