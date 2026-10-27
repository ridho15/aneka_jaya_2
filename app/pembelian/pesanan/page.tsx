import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listPurchaseOrders, listSuppliers } from "@/lib/purchasing/purchasingStore";
import { PurchaseOrderView, type PurchaseOrderData } from "@/components/purchasing/PurchaseOrderView";

export const dynamic = "force-dynamic";

export default async function PembelianPesananPage() {
  await requirePermission("purchasing.view");

  const [rawOrders, rawSuppliers] = await Promise.all([
    listPurchaseOrders(),
    listSuppliers({ isActive: true })
  ]);

  const orders: PurchaseOrderData[] = rawOrders.map((o) => ({
    id: o.id,
    poNumber: o.poNumber,
    supplierId: o.supplierId,
    supplier: {
      id: o.supplier.id,
      code: o.supplier.code,
      name: o.supplier.name,
      currency: o.supplier.currency
    },
    orderDate: o.orderDate.toISOString(),
    expectedDeliveryDate: o.expectedDeliveryDate ? o.expectedDeliveryDate.toISOString() : null,
    currency: o.currency,
    exchangeRate: Number(o.exchangeRate),
    subtotalOriginal: Number(o.subtotalOriginal),
    subtotalIdr: Number(o.subtotalIdr),
    totalAmountOriginal: Number(o.totalAmountOriginal),
    totalAmountIdr: Number(o.totalAmountIdr),
    status: o.status,
    notes: o.notes,
    createdByNameSnapshot: o.createdByNameSnapshot,
    approvedByNameSnapshot: o.approvedByNameSnapshot,
    approvedAt: o.approvedAt ? o.approvedAt.toISOString() : null,
    items: o.items.map((it) => ({
      id: it.id,
      itemCode: it.itemCode,
      itemName: it.itemName,
      unit: it.unit,
      quantity: Number(it.quantity),
      receivedQuantity: Number(it.receivedQuantity),
      unitPriceOriginal: Number(it.unitPriceOriginal),
      unitPriceIdr: Number(it.unitPriceIdr),
      totalAmountOriginal: Number(it.totalAmountOriginal),
      totalAmountIdr: Number(it.totalAmountIdr),
      notes: it.notes
    })),
    receipts: o.receipts?.map((r) => ({
      id: r.id,
      grnNumber: r.grnNumber,
      receiptDate: r.receiptDate.toISOString(),
      warehouseName: r.warehouseName,
      receivedByNameSnapshot: r.receivedByNameSnapshot,
      items: r.items.map((it) => ({
        id: it.id,
        itemCode: it.itemCode,
        itemName: it.itemName,
        quantityReceived: Number(it.quantityReceived)
      }))
    }))
  }));

  const suppliers = rawSuppliers.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    currency: s.currency
  }));

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
            Pesanan Pembelian (Purchase Order)
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manajemen alur pesanan impor valuta asing (USD / RMB) dan domestik, persetujuan bertingkat, dan penerimaan fisik barang (GRN).
          </p>
        </div>

        <PurchaseOrderView initialOrders={orders} suppliers={suppliers} />
      </div>
    </AppShell>
  );
}
