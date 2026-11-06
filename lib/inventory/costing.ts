import "server-only";
import { Prisma, type InventoryMovementType } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Penilaian persediaan FIFO satu perusahaan per barang. Transfer antar lokasi tidak menyentuh lapisan,
 * jadi nilai total persediaan tetap. Barang yang stoknya sudah ada sebelum lapisan dipakai mendapat
 * lapisan OPENING (inLedger=false): nilainya belum pernah dibukukan dan tampil di rekonsiliasi.
 */

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

const NO_VALUATION: InventoryMovementType[] = ["TRANSFER_IN", "TRANSFER_OUT"];
const OPENING_ON_FIRST: InventoryMovementType[] = ["INITIAL", "OPNAME", "ADJUSTMENT_IN"];

export type Valuation = { totalCost: number | null; unitCost: number; complete: boolean; note?: string };

async function layerCount(tx: Tx, productId: string) {
  return tx.inventoryCostLayer.count({ where: { productId } });
}

/** Buat lapisan saldo awal dari stok yang sudah ada sebelum FIFO dipakai (sekali per barang). */
export async function ensureOpeningLayer(tx: Tx, productId: string) {
  if ((await layerCount(tx, productId)) > 0) return false;
  const balances = await tx.inventoryBalance.findMany({ where: { productId }, select: { quantity: true, avgCost: true } });
  const onHand = balances.reduce((s, b) => s + num(b.quantity), 0);
  if (onHand <= 0) return false;
  const positive = balances.filter((b) => num(b.quantity) > 0 && num(b.avgCost) > 0);
  const weighted = positive.reduce((s, b) => s + num(b.quantity) * num(b.avgCost), 0);
  const weightQty = positive.reduce((s, b) => s + num(b.quantity), 0);
  let unitCost = weightQty > 0 ? weighted / weightQty : 0;
  if (unitCost <= 0) {
    const product = await tx.inventoryProduct.findUnique({ where: { id: productId }, select: { costPrice: true } });
    unitCost = num(product?.costPrice);
  }
  await tx.inventoryCostLayer.create({
    data: {
      productId, source: "OPENING", receivedAt: new Date(0), quantity: r4(onHand), remaining: r4(onHand),
      unitCost: r4(unitCost), costKnown: unitCost > 0, inLedger: false
    }
  });
  return true;
}

/** Nilai satu pergerakan dan perbarui lapisan FIFO. Dipanggil di dalam transaksi postMovement. */
export async function valueMovement(
  tx: Tx,
  movement: { id: string; productId: string; type: InventoryMovementType; quantity: number; movementDate: Date },
  hints: { unitCost?: number; layerSource?: string; hadLayersBefore: boolean }
): Promise<Valuation> {
  const qty = movement.quantity;
  if (NO_VALUATION.includes(movement.type) || qty === 0) return { totalCost: null, unitCost: hints.unitCost ?? 0, complete: true };

  if (qty > 0) {
    let unitCost = hints.unitCost ?? 0;
    if (!(unitCost > 0)) {
      const product = await tx.inventoryProduct.findUnique({ where: { id: movement.productId }, select: { costPrice: true } });
      unitCost = num(product?.costPrice);
    }
    const opening = !hints.hadLayersBefore && OPENING_ON_FIRST.includes(movement.type);
    const source = opening ? "OPENING"
      : hints.layerSource ?? (movement.type === "PURCHASE_RECEIPT" ? "RECEIPT" : movement.type === "SALE_RETURN" ? "RETURN" : movement.type === "SALE_REVERSAL" ? "REVERSAL" : "GAIN");
    const known = unitCost > 0;
    await tx.inventoryCostLayer.create({
      data: {
        productId: movement.productId, movementId: movement.id, source, receivedAt: movement.movementDate,
        quantity: r4(qty), remaining: r4(qty), unitCost: r4(unitCost), costKnown: known, inLedger: !opening
      }
    });
    return {
      totalCost: r2(qty * unitCost), unitCost: r2(unitCost), complete: known,
      note: known ? (opening ? "Saldo awal barang (belum dibukukan)" : undefined) : "Modal barang belum diisi"
    };
  }

  // Keluar: pakai lapisan tertua lebih dulu.
  const need = -qty;
  const layers = await tx.$queryRaw<{ id: string; remaining: Prisma.Decimal; unitCost: Prisma.Decimal; costKnown: boolean }[]>`
    SELECT "id", "remaining", "unitCost", "costKnown" FROM "InventoryCostLayer"
    WHERE "productId" = ${movement.productId} AND "remaining" > 0
    ORDER BY "receivedAt" ASC, "createdAt" ASC
    FOR UPDATE`;
  let left = need;
  let cost = 0;
  let complete = true;
  for (const layer of layers) {
    if (left <= 0) break;
    const take = Math.min(left, num(layer.remaining));
    if (take <= 0) continue;
    await tx.inventoryCostLayer.update({ where: { id: layer.id }, data: { remaining: r4(num(layer.remaining) - take) } });
    await tx.inventoryCostConsumption.create({ data: { movementId: movement.id, layerId: layer.id, quantity: r4(take), unitCost: layer.unitCost } });
    cost += take * num(layer.unitCost);
    if (!layer.costKnown) complete = false;
    left = r4(left - take);
  }
  let note: string | undefined;
  if (left > 0) {
    // Stok minus: tidak ada lapisan; dinilai dari modal master dan ditandai belum lengkap.
    const product = await tx.inventoryProduct.findUnique({ where: { id: movement.productId }, select: { costPrice: true, unit: true } });
    const master = num(product?.costPrice);
    cost += left * master;
    complete = false;
    note = `Stok minus ${left} ${product?.unit ?? ""}`.trim() + (master > 0 ? `, dinilai dari modal master Rp ${master.toLocaleString("id-ID")}` : ", modal belum diketahui");
  } else if (!complete) {
    note = "Sebagian lapisan FIFO belum punya modal";
  }
  return { totalCost: -r2(cost), unitCost: r2(cost / need), complete, note };
}

export async function productHasLayers(tx: Tx, productId: string) {
  return (await layerCount(tx, productId)) > 0;
}
