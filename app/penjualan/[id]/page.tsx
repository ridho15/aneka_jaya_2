import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { TransactionCancelButton } from "@/components/transactions/TransactionCancelButton";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { formatJakartaDateTime } from "@/lib/date/jakarta";
import { listAllRekeningAccounts } from "@/lib/business/masterData";
import { salesRekeningLabel } from "@/lib/sales/rekening";
import { getSalesRecordForUser } from "@/lib/sales/access";

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function Badge({ value, tone = "slate" }: { value: string; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const colors = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700"
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors}`}>{value}</span>;
}

function statusTone(value?: string) {
  if (value === "approved" || value === "synced" || value === "released" || value === "paid" || value === "partial") return "green";
  if (value === "pending_approval" || value === "pending") return "amber";
  if (value === "rejected" || value === "failed" || value === "cancelled") return "red";
  return "slate";
}

export default async function SalesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const role = user.role;
  if (!can(role, "penjualan.create") && !can(role, "reports.view")) redirect("/");
  const { id } = await params;
  const sale = await getSalesRecordForUser(id, user);
  if (!sale) notFound();
  const rekeningLabel = salesRekeningLabel(sale, await listAllRekeningAccounts());
  const canManage = can(role, "penjualan.manage");
  const canViewTransactionNumber = role === "OWNER";
  const needsCancelAndRecreate =
    sale.syncTarget === "erp" &&
    (sale.stockReleaseStatus === "released" || sale.erpPaymentStatus === "paid" || sale.erpPaymentStatus === "partial");

  return (
    <AppShell>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Detail Penjualan</p>
          <h2 className="aj-page-title text-3xl font-bold">{sale.customerName}</h2>
          {canViewTransactionNumber && <p className="mt-2 font-mono text-sm text-slate-500">{sale.transactionNumber || sale.id}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/penjualan" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Riwayat</Link>
          <Link href={`/print/sales/${sale.id}?auto=1`} target="_blank" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 shadow-xs">Cetak Langsung</Link>
          <Link href={`/print/sales/${sale.id}`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Preview Cetak</Link>
          {canManage && sale.source !== "MJ" && sale.approvalStatus !== "cancelled" && !needsCancelAndRecreate && <Link href={`/penjualan/${sale.id}/edit`} className="rounded-xl border border-blue-300 px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50">Edit</Link>}
        </div>
      </div>

      <section className="aj-surface mb-5 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Info label="Tanggal Transaksi" value={sale.transactionAt ? formatJakartaDateTime(sale.transactionAt) : sale.saleDate} />
          <Info label="Tanggal & Jam Kirim" value={sale.deliveryAt ? formatJakartaDateTime(sale.deliveryAt) : "—"} />
          <Info label="Dibuat Pada" value={sale.createdAt ? formatJakartaDateTime(sale.createdAt) : "—"} />
          <Info label="Tipe" value={sale.tipeCodeSnapshot || sale.tipeId || "—"} />
          <Info label="Pembayaran" value={sale.paymentMethod} />
          <Info label="Rekening digunakan" value={rekeningLabel} />
          <Info label="Customer" value={sale.customerName} />
          <Info label="Lokasi" value={sale.customerLocation || "—"} />
          <Info label="Pengiriman" value={sale.shippingMethod || "—"} />
          <Info label="Pembuat" value={sale.createdByNameSnapshot || "—"} />
          {sale.source === "MJ" && <Info label="Mode Integrasi MJ" value={sale.integrationProcessingMode || "slm_process_aj"} />}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Status Cetak</p>
            <div className="mt-1">
              {sale.isPrinted ? (
                <Badge value={`🖨️ Tercetak${sale.printCount ? ` (${sale.printCount}x)` : ""}`} tone="green" />
              ) : (
                <Badge value="Belum Dicetak" tone="slate" />
              )}
            </div>
          </div>
          {sale.printedAt && <Info label="Waktu Cetak Terakhir" value={`${formatJakartaDateTime(sale.printedAt)}${sale.printedBy ? ` (${sale.printedBy})` : ""}`} />}
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Approval</p><div className="mt-1"><Badge value={sale.approvalStatus || "approved"} tone={statusTone(sale.approvalStatus || "approved")} /></div></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Invoice ERP</p><div className="mt-1"><Badge value={sale.syncStatus || "local"} tone={statusTone(sale.syncStatus || "local")} /></div></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Release Stok</p><div className="mt-1">{sale.syncTarget === "erp" ? <Badge value={sale.stockReleaseStatus || "not_required"} tone={statusTone(sale.stockReleaseStatus || "not_required")} /> : <span className="text-sm text-slate-500">—</span>}</div></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment ERP</p><div className="mt-1">{sale.syncTarget === "erp" ? <Badge value={sale.erpPaymentStatus || "not_required"} tone={statusTone(sale.erpPaymentStatus || "not_required")} /> : <span className="text-sm text-slate-500">—</span>}</div></div>
          <Info label="ERP Reference" value={sale.erpReference || "—"} />
          <Info label="Nomor Invoice ERP" value={sale.erpInvoiceNumber || "—"} />
          <Info label="ID Invoice ERP" value={sale.erpInvoiceId ? String(sale.erpInvoiceId) : "—"} />
          <Info label="Release Reference" value={sale.stockReleaseReference || "—"} />
          <Info label="Payment Reference" value={sale.erpPaymentReference || "—"} />
          <Info label="Test Reference" value={sale.testReference || "—"} />
          <Info label="Total" value={rupiah(sale.total)} strong />
          {sale.paymentMethod === "Tempo" && <Info label="Pembayaran Awal / DP" value={rupiah(sale.initialPaymentAmount || 0)} strong />}
          {sale.paymentMethod === "Tempo" && <Info label="Sisa Tempo Awal" value={rupiah(Math.max(0, sale.total - (sale.initialPaymentAmount || 0)))} strong />}
          {sale.paymentMethod === "Tempo" && <Info label="Metode DP" value={sale.initialPaymentMethod || "—"} />}
          {sale.paymentMethod === "Tempo" && <Info label="Rekening DP" value={sale.initialPaymentRekeningNameSnapshot || "—"} />}
        </div>
        {sale.syncError && <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{sale.syncError}</p>}
        {sale.stockReleaseError && <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">{sale.stockReleaseError}</p>}
        {sale.erpPaymentError && <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">{sale.erpPaymentError}</p>}
        {needsCancelAndRecreate && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            Transaksi sudah masuk proses lanjutan di ERP. Jika ada salah input, gunakan cancel/void lalu buat transaksi koreksi baru dengan ERP reference baru.
          </p>
        )}
        {canManage && sale.source !== "MJ" && (
          <div className="mt-5">
            <TransactionCancelButton
              id={sale.id}
              kind="sales"
              disabled={sale.approvalStatus === "cancelled"}
              disabledReason="Transaksi sudah dibatalkan."
            />
          </div>
        )}
      </section>

      <section className="aj-surface overflow-x-auto">
        <div className="border-b border-slate-200 px-5 py-4 font-bold text-slate-900">Item Barang</div>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Produk</th><th className="px-5 py-3">Lokasi Stok</th><th className="px-5 py-3 text-right">Qty</th><th className="px-5 py-3">Satuan</th><th className="px-5 py-3 text-right">Harga</th><th className="px-5 py-3 text-right">Diskon</th><th className="px-5 py-3 text-right">Subtotal</th></tr></thead>
          <tbody>{sale.items.map((item, index) => <tr key={`${item.productRef}-${index}`} className="border-b border-slate-100"><td className="px-5 py-4 font-semibold">{item.productRef}</td><td className="px-5 py-4 text-slate-600">{[item.warehouseNameSnapshot, item.rackNameSnapshot].filter(Boolean).join(" / ") || "—"}</td><td className="px-5 py-4 text-right">{item.quantity}</td><td className="px-5 py-4">{item.unitSnapshot || "—"}</td><td className="px-5 py-4 text-right">{rupiah(item.unitPrice)}</td><td className="px-5 py-4 text-right">{rupiah(item.discount || 0)}</td><td className="px-5 py-4 text-right font-semibold">{rupiah(item.quantity * item.unitPrice - (item.discount || 0))}</td></tr>)}</tbody>
        </table>
      </section>
    </AppShell>
  );
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 ${strong ? "text-lg font-bold text-slate-900" : "text-sm text-slate-700"}`}>{value}</p></div>;
}
