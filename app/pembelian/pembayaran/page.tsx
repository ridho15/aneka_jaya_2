import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listPurchasePayments } from "@/lib/purchasing/paymentStore";
import { listPurchaseInvoices } from "@/lib/purchasing/purchasingStore";
import { listAllRekeningAccounts } from "@/lib/business/masterData";
import { PurchasePaymentView, type PurchasePaymentData } from "@/components/purchasing/PurchasePaymentView";

export const dynamic = "force-dynamic";

export default async function PembelianPembayaranPage() {
  await requirePermission("purchasing.view");

  const [rawPayments, rawInvoices, rawRekenings] = await Promise.all([
    listPurchasePayments(),
    listPurchaseInvoices({ status: "POSTED" }),
    listAllRekeningAccounts()
  ]);

  // Also include PARTIAL_PAID invoices for payment
  const partialInvoices = await listPurchaseInvoices({ status: "PARTIAL_PAID" });
  const allPayableInvoices = [...rawInvoices, ...partialInvoices];

  const payments: PurchasePaymentData[] = rawPayments.map((p) => ({
    id: p.id,
    paymentNumber: p.paymentNumber,
    purchaseInvoiceId: p.purchaseInvoiceId,
    purchaseInvoice: {
      invoiceNumber: p.purchaseInvoice.invoiceNumber,
      supplierInvoiceNumber: p.purchaseInvoice.supplierInvoiceNumber,
      currency: p.purchaseInvoice.currency,
      exchangeRate: Number(p.purchaseInvoice.exchangeRate)
    },
    supplierId: p.supplierId,
    supplier: {
      id: p.supplier.id,
      code: p.supplier.code,
      name: p.supplier.name
    },
    paymentDate: p.paymentDate.toISOString(),
    rekeningAccountId: p.rekeningAccountId,
    rekeningAccount: {
      name: p.rekeningAccount.name,
      bank: p.rekeningAccount.bankName || p.rekeningAccount.name,
      currency: p.rekeningAccount.currency
    },
    currency: p.currency,
    amountPaidOriginal: Number(p.amountPaidOriginal),
    paymentRate: Number(p.paymentRate),
    invoiceRate: Number(p.invoiceRate),
    settledPayableIdr: Number(p.settledPayableIdr),
    totalPaidIdr: Number(p.totalPaidIdr),
    forexDiffIdr: Number(p.forexDiffIdr),
    forexAccountCode: p.forexAccountCode,
    notes: p.notes,
    journalEntryId: p.journalEntryId,
    journalEntry: p.journalEntry
      ? {
          journalNumber: p.journalEntry.journalNumber,
          lines: ((p.journalEntry as any).lines || []).map((l: any) => ({
            accountCodeSnapshot: l.accountCodeSnapshot,
            accountNameSnapshot: l.accountNameSnapshot,
            debit: Number(l.debit),
            credit: Number(l.credit),
            memo: l.memo
          }))
        }
      : null
  }));

  const invoices = allPayableInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    supplierInvoiceNumber: inv.supplierInvoiceNumber,
    supplier: {
      name: inv.supplier.name,
      currency: inv.supplier.currency
    },
    currency: inv.currency,
    exchangeRate: Number(inv.exchangeRate),
    totalAmountOriginal: Number(inv.totalAmountOriginal),
    totalPaidOriginal: Number(inv.totalPaidOriginal)
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
            Pembayaran Valas & Selisih Kurs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pelunasan faktur utang supplier valuta asing, revaluasi nilai tukar realisasi bank, dan otomatisasi pengakuan laba/rugi selisih kurs.
          </p>
        </div>

        <PurchasePaymentView
          initialPayments={payments}
          invoices={invoices}
          rekenings={rekenings}
        />
      </div>
    </AppShell>
  );
}
