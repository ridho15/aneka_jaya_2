import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Sale } from "@/lib/types/sales";

export type StockShortage = Record<string, Record<string, number>>;

/**
 * Qty per barang per nota yang terjual melebihi stok (barang "kosong tapi tetap jadi penjualan").
 * Nota yang stoknya sudah dipotong: dari kartu stok (saldo jadi minus). Draft / belum dipotong: dari stok total sekarang.
 */
export async function stockShortageForSales(sales: Sale[]): Promise<StockShortage> {
  if (!sales.length || typeof prisma?.inventoryMovement?.findMany !== "function") return {};
  const result: StockShortage = {};
  const add = (saleId: string, productRef: string, qty: number) => {
    if (!(qty > 0)) return;
    result[saleId] ??= {};
    result[saleId][productRef.trim().toLowerCase()] = (result[saleId][productRef.trim().toLowerCase()] ?? 0) + Math.round(qty * 100) / 100;
  };

  const released = sales.filter((s) => s.stockReleaseReference && (s.stockReleaseStatus === "released" || s.stockReleaseStatus === "already_released"));
  if (released.length) {
    const moves = await prisma.inventoryMovement.findMany({
      where: { type: "SALE_OUT", balanceAfter: { lt: 0 }, referenceNumber: { in: released.map((s) => s.stockReleaseReference!) } },
      select: { referenceNumber: true, quantity: true, balanceAfter: true, product: { select: { sku: true } } }
    });
    const byRef = new Map(released.map((s) => [s.stockReleaseReference!, s.id]));
    for (const m of moves) {
      const saleId = m.referenceNumber ? byRef.get(m.referenceNumber) : undefined;
      if (saleId) add(saleId, m.product.sku, Math.min(Math.abs(Number(m.quantity)), -Number(m.balanceAfter)));
    }
  }

  const pending = sales.filter((s) => !released.includes(s) && s.approvalStatus !== "cancelled");
  const refs = Array.from(new Set(pending.flatMap((s) => s.items.map((i) => i.productRef))));
  if (refs.length) {
    const products = await prisma.inventoryProduct.findMany({
      where: { sku: { in: refs } },
      select: { sku: true, balances: { select: { quantity: true } } }
    });
    const onHand = new Map(products.map((p) => [p.sku.toLowerCase(), Math.max(0, p.balances.reduce((s, b) => s + Number(b.quantity), 0))]));
    for (const sale of pending) {
      for (const item of sale.items) {
        const stock = onHand.get(item.productRef.trim().toLowerCase());
        if (stock === undefined) continue;
        add(sale.id, item.productRef, Number(item.quantity) - stock);
      }
    }
  }
  return result;
}
