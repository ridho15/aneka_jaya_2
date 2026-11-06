import "server-only";
import { prisma } from "@/lib/db/prisma";
import { saleDayKey } from "@/lib/sales/dayKey";

/**
 * Permintaan barang dari gudang: barang yang terjual tetapi stoknya dipotong dari lokasi gudang
 * (toko tidak punya stoknya), jadi barangnya perlu diambil dari gudang. Penjualan batal tidak masuk.
 */
export type WarehouseRequestLine = { sku: string; name: string; unit: string; warehouse: string; quantity: number };
export type WarehouseRequestSale = {
  saleId: string | null;
  transactionNumber: string | null;
  customerName: string;
  transactionAt: string | null;
  dayKey: string;
  createdBy: string | null;
  lines: WarehouseRequestLine[];
};

export async function getWarehouseRequests(filter: { from: string; to: string }) {
  const start = new Date(new Date(`${filter.from}T00:00:00+07:00`).getTime() - 86_400_000);
  const end = new Date(new Date(`${filter.to}T00:00:00+07:00`).getTime() + 2 * 86_400_000);
  const movements = await prisma.inventoryMovement.findMany({
    where: { type: "SALE_OUT", location: { type: "WAREHOUSE" }, movementDate: { gte: start, lt: end } },
    include: { product: { select: { sku: true, name: true, unit: true } }, location: { select: { name: true } } },
    orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }]
  });
  const reversed = new Set(
    (await prisma.inventoryMovement.findMany({ where: { type: "SALE_REVERSAL", referenceId: { in: movements.map((m) => m.id) } }, select: { referenceId: true } }))
      .map((m) => m.referenceId)
  );
  const references = Array.from(new Set(movements.map((m) => m.referenceNumber).filter((r): r is string => Boolean(r))));
  const sales = await prisma.salesRecord.findMany({
    where: { stockReleaseReference: { in: references } },
    select: { id: true, transactionNumber: true, customerName: true, transactionAt: true, saleDate: true, createdByNameSnapshot: true, approvalStatus: true, stockReleaseReference: true }
  });
  const saleByRef = new Map(sales.map((s) => [s.stockReleaseReference!, s]));

  const bySale = new Map<string, WarehouseRequestSale>();
  const byProduct = new Map<string, { sku: string; name: string; unit: string; warehouse: string; quantity: number; notaCount: number }>();
  for (const m of movements) {
    if (reversed.has(m.id)) continue;
    const sale = m.referenceNumber ? saleByRef.get(m.referenceNumber) : undefined;
    if (sale?.approvalStatus === "cancelled") continue;
    const transactionAt = sale?.transactionAt?.toISOString() ?? null;
    const dayKey = saleDayKey({ transactionAt: transactionAt ?? undefined, saleDate: (sale?.saleDate ?? m.movementDate).toISOString().slice(0, 10) });
    if (dayKey < filter.from || dayKey > filter.to) continue;
    const quantity = Math.abs(Number(m.quantity));
    const key = sale?.id ?? m.referenceNumber ?? m.id;
    const entry = bySale.get(key) ?? {
      saleId: sale?.id ?? null, transactionNumber: sale?.transactionNumber ?? null, customerName: sale?.customerName ?? (m.notes || "-"),
      transactionAt, dayKey, createdBy: sale?.createdByNameSnapshot ?? m.createdByName, lines: []
    };
    entry.lines.push({ sku: m.product.sku, name: m.product.name, unit: m.product.unit, warehouse: m.location.name, quantity });
    bySale.set(key, entry);
    const pKey = `${m.product.sku}|${m.location.name}`;
    const p = byProduct.get(pKey) ?? { sku: m.product.sku, name: m.product.name, unit: m.product.unit, warehouse: m.location.name, quantity: 0, notaCount: 0 };
    p.quantity += quantity;
    p.notaCount += 1;
    byProduct.set(pKey, p);
  }
  const list = Array.from(bySale.values()).sort((a, b) => (b.transactionAt ?? b.dayKey).localeCompare(a.transactionAt ?? a.dayKey));
  return {
    sales: list,
    products: Array.from(byProduct.values()).sort((a, b) => a.warehouse.localeCompare(b.warehouse) || b.quantity - a.quantity),
    dayCounts: list.reduce((m, s) => m.set(s.dayKey, (m.get(s.dayKey) ?? 0) + 1), new Map<string, number>())
  };
}
