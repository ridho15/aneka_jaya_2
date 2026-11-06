import "server-only";
import { prisma } from "@/lib/db/prisma";
import { saleDayKey } from "@/lib/sales/dayKey";

/**
 * Laporan Consignment: barang yang terjual saat stoknya 0 (atau kurang), sehingga stok lokasi menjadi minus.
 * Qty yang dihitung hanya bagian yang melebihi stok saat itu. Penjualan yang dibatalkan tidak dihitung.
 */
export type ConsignmentLine = {
  sku: string;
  name: string;
  unit: string;
  location: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type ConsignmentSale = {
  saleId: string | null;
  transactionNumber: string | null;
  customerName: string;
  transactionAt: string | null;
  saleDate: string;
  dayKey: string;
  createdBy: string | null;
  lines: ConsignmentLine[];
  total: number;
};

export type ConsignmentDay = { dayKey: string; notaCount: number; quantity: number; total: number };

export async function getConsignmentReport(filter: { from: string; to: string; keyword?: string }) {
  const start = new Date(`${filter.from}T00:00:00+07:00`);
  const end = new Date(new Date(`${filter.to}T00:00:00+07:00`).getTime() + 86_400_000);
  const movements = await prisma.inventoryMovement.findMany({
    where: { type: "SALE_OUT", balanceAfter: { lt: 0 }, movementDate: { gte: new Date(start.getTime() - 86_400_000), lt: new Date(end.getTime() + 86_400_000) } },
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
    select: { id: true, transactionNumber: true, customerName: true, transactionAt: true, saleDate: true, createdByNameSnapshot: true, approvalStatus: true, stockReleaseReference: true, items: { select: { productId: true, productRef: true, quantity: true, unitPrice: true, discount: true } } }
  });
  const saleByRef = new Map(sales.map((s) => [s.stockReleaseReference!, s]));

  const bySale = new Map<string, ConsignmentSale>();
  const keyword = filter.keyword?.trim().toLowerCase();
  for (const m of movements) {
    if (reversed.has(m.id)) continue;
    const sale = m.referenceNumber ? saleByRef.get(m.referenceNumber) : undefined;
    if (sale?.approvalStatus === "cancelled") continue;
    const sold = Math.abs(Number(m.quantity));
    const shortfall = Math.min(sold, -Number(m.balanceAfter));
    if (shortfall <= 0) continue;
    const item = sale?.items.find((i) => i.productId === m.productId || i.productRef === m.product.sku);
    // Harga bersih per satuan setelah diskon baris.
    const unitPrice = item && Number(item.quantity) > 0 ? (Number(item.quantity) * Number(item.unitPrice) - Number(item.discount)) / Number(item.quantity) : 0;
    const transactionAt = sale?.transactionAt?.toISOString() ?? null;
    const saleDate = (sale?.saleDate ?? m.movementDate).toISOString().slice(0, 10);
    const dayKey = saleDayKey({ transactionAt: transactionAt ?? undefined, saleDate });
    if (dayKey < filter.from || dayKey > filter.to) continue;
    const key = sale?.id ?? m.referenceNumber ?? m.id;
    const entry = bySale.get(key) ?? {
      saleId: sale?.id ?? null, transactionNumber: sale?.transactionNumber ?? null, customerName: sale?.customerName ?? (m.notes || "-"),
      transactionAt, saleDate, dayKey, createdBy: sale?.createdByNameSnapshot ?? m.createdByName, lines: [], total: 0
    };
    const amount = Math.round(shortfall * unitPrice);
    entry.lines.push({ sku: m.product.sku, name: m.product.name, unit: m.product.unit, location: m.location.name, quantity: shortfall, unitPrice: Math.round(unitPrice), amount });
    entry.total += amount;
    bySale.set(key, entry);
  }

  let list = Array.from(bySale.values());
  if (keyword) {
    list = list.filter((s) => `${s.customerName} ${s.transactionNumber ?? ""} ${s.lines.map((l) => `${l.sku} ${l.name}`).join(" ")}`.toLowerCase().includes(keyword));
  }
  list.sort((a, b) => (b.transactionAt ?? b.saleDate).localeCompare(a.transactionAt ?? a.saleDate));

  const days = new Map<string, ConsignmentDay>();
  for (const s of list) {
    const d = days.get(s.dayKey) ?? { dayKey: s.dayKey, notaCount: 0, quantity: 0, total: 0 };
    d.notaCount += 1;
    d.quantity += s.lines.reduce((sum, l) => sum + l.quantity, 0);
    d.total += s.total;
    days.set(s.dayKey, d);
  }
  return {
    sales: list,
    days: Array.from(days.values()),
    totals: { notaCount: list.length, total: list.reduce((s, x) => s + x.total, 0), items: list.reduce((s, x) => s + x.lines.length, 0) }
  };
}
