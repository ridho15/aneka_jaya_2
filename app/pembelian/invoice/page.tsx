import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listPurchaseInvoices, listSuppliers, listPurchaseOrders } from "@/lib/purchasing/purchasingStore";
import { listAllRekeningAccounts } from "@/lib/business/masterData";
import { PurchaseInvoiceView, type PurchaseInvoiceData } from "@/components/purchasing/PurchaseInvoiceView";

export const dynamic = "force-dynamic";

export default async function PembelianInvoicePage() {
  await requirePermission("purchasing.view");

  const [rawInvoices, rawSuppliers, rawOrders, rawRekenings] = await Promise.all([
    listPurchaseInvoices(),
    listSuppliers({ isActive: true }),
    listPurchaseOrders(),
    listAllRekeningAccounts()
  ]);

  const invoices: PurchaseInvoiceData[] = rawInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    supplierInvoiceNumber: inv.supplierInvoiceNumber,
    purchaseOrderId: inv.purchaseOrderId,
    purchaseOrder: inv.purchaseOrder ? { poNumber: inv.purchaseOrder.poNumber } : null,
    supplierId: inv.supplierId,
    supplier: {
      id: inv.supplier.id,
      code: inv.supplier.code,
      name: inv.supplier.name,
      currency: inv.supplier.currency
    },
    invoiceDate: inv.invoiceDate.toISOString(),
    dueDate: inv.dueDate.toISOString(),
    currency: inv.currency,
    exchangeRate: Number(inv.exchangeRate),
    subtotalOriginal: Number(inv.subtotalOriginal),
    subtotalIdr: Number(inv.subtotalIdr),
    landedCostTotalIdr: Number(inv.landedCostTotalIdr),
    totalAmountOriginal: Number(inv.totalAmountOriginal),
    totalAmountIdr: Number(inv.totalAmountIdr),
    totalPaidOriginal: Number(inv.totalPaidOriginal),
    totalPaidIdr: Number(inv.totalPaidIdr),
    status: inv.status,
    notes: inv.notes,
    journalEntryId: inv.journalEntryId,
    journalEntry: inv.journalEntry
      ? {
          journalNumber: inv.journalEntry.journalNumber,
          totalDebit: Number(inv.journalEntry.totalDebit),
          lines: ((inv.journalEntry as any).lines || []).map((l: any) => ({
            accountCodeSnapshot: l.accountCodeSnapshot,
            accountNameSnapshot: l.accountNameSnapshot,
            debit: Number(l.debit),
            credit: Number(l.credit),
            memo: l.memo
          }))
        }
      : null,
    landedCosts: inv.landedCosts.map((lc) => ({
      id: lc.id,
      costType: lc.costType,
      isCreditableTax: lc.isCreditableTax,
      description: lc.description,
      vendorName: lc.vendorName,
      originalCurrency: lc.originalCurrency,
      originalAmount: Number(lc.originalAmount),
      exchangeRate: Number(lc.exchangeRate),
      amountIdr: Number(lc.amountIdr),
      allocationMethod: lc.allocationMethod
    }))
  }));

  const suppliers = rawSuppliers.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    currency: s.currency
  }));

  const purchaseOrders = rawOrders.map((o) => ({
    id: o.id,
    poNumber: o.poNumber,
    supplierId: o.supplierId,
    currency: o.currency,
    subtotalOriginal: Number(o.subtotalOriginal),
    exchangeRate: Number(o.exchangeRate),
    items: o.items.map((it) => ({
      id: it.id,
      itemCode: it.itemCode,
      itemName: it.itemName,
      unit: it.unit,
      quantity: Number(it.quantity),
      unitPriceOriginal: Number(it.unitPriceOriginal)
    }))
  }));

  const rekenings = rawRekenings.map((r) => ({
    id: r.id,
    name: r.name,
    bank: r.bank,
    currency: r.currency
  }));

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
            Tagihan Pembelian & Landed Cost Impor
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pencatatan faktur pembelian valuta asing, distribusi biaya landed cost (ongkir, bea cukai) ke HPP barang, dan isolasi pajak impor.
          </p>
        </div>

        <PurchaseInvoiceView
          initialInvoices={invoices}
          suppliers={suppliers}
          purchaseOrders={purchaseOrders}
          rekenings={rekenings}
        />
      </div>
    </AppShell>
  );
}
