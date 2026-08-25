import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { jakartaDateFromKey } from "@/lib/date/jakarta";
import { getPaidSalesReport } from "@/lib/reports/store";
import { listTempoReceivables } from "@/lib/tempo/store";
import { formatDailyReportText } from "@/lib/whatsapp/reportFormatter";

export const dynamic = "force-dynamic";

const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export default async function ReportsPage({ searchParams }: { searchParams?: Promise<{ date?: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "reports.view")) redirect("/");

  const params = await searchParams;
  const selectedDate = jakartaDateFromKey(params?.date);
  const [summary, tempo] = await Promise.all([
    getPaidSalesReport(selectedDate),
    listTempoReceivables()
  ]);
  const openTempo = tempo.filter((row) => !["paid", "cancelled", "written_off"].includes(row.status));
  const reportText = formatDailyReportText(summary, openTempo, new Date(`${selectedDate}T12:00:00+07:00`));
  const canSeeQaNote = role === "OWNER";

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="aj-page-title text-3xl font-bold">Laporan Penerimaan Harian</h2>
          <p className="mt-1 text-sm text-slate-600">Laporan penerimaan harian dari penjualan lunas dan pembayaran Tempo. Transaksi QA dikecualikan.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/reports/products"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-xs transition hover:border-emerald-500 hover:text-emerald-700 sm:text-sm"
          >
            📊 Laporan Produk
          </Link>
          <Link
            href="/reports/stocks"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-xs transition hover:border-emerald-500 hover:text-emerald-700 sm:text-sm"
          >
            📦 Laporan Stok
          </Link>
          <Link
            href="/reports/finance"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-xs transition hover:border-emerald-500 hover:text-emerald-700 sm:text-sm"
          >
            💰 Laporan Finance
          </Link>
        </div>
      </div>

      <form className="aj-surface mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <label className="text-sm font-semibold text-slate-700">
          <span className="mb-1 block">Tanggal laporan</span>
          <input className="w-full rounded-xl border border-slate-300 px-3 py-2 sm:w-auto" type="date" name="date" defaultValue={selectedDate} />
        </label>
        <button className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700">Terapkan</button>
      </form>

      <div className="mb-5 grid gap-4 lg:grid-cols-4 md:grid-cols-2">
        <section className="aj-surface p-5">
          <p className="text-sm text-slate-500">Grand Total paid</p>
          <p className="mt-2 text-2xl font-black">{rupiah(summary.grandTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">Termasuk pembayaran Tempo • exclude QA</p>
        </section>
        <section className="aj-surface p-5">
          <p className="text-sm text-slate-500">Cash</p>
          <p className="mt-2 text-2xl font-black">{rupiah(summary.totalCash)}</p>
        </section>
        <section className="aj-surface p-5">
          <p className="text-sm text-slate-500">Transfer</p>
          <p className="mt-2 text-2xl font-black">{rupiah(summary.totalTf)}</p>
        </section>
        <section className="aj-surface p-5">
          <p className="text-sm text-slate-500">AJ belum tersinkron ERP</p>
          <p className="mt-2 text-2xl font-black text-amber-700">{rupiah(summary.unsyncedErpTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">{summary.unsyncedErpCount} transaksi pending/failed.</p>
        </section>
      </div>

      {canSeeQaNote && summary.excludedTestCount > 0 && (
        <section className="aj-surface mb-5 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {summary.excludedTestCount} transaksi QA senilai {rupiah(summary.excludedTestTotal)} dikeluarkan dari laporan operasional.
        </section>
      )}

      {summary.tempoPayments.length > 0 && <section className="aj-surface mb-5 p-5"><p className="font-bold">Pembayaran Tempo diterima</p><p className="mt-1 text-sm text-slate-500">{summary.tempoPayments.length} pembayaran • {rupiah(summary.tempoPaymentTotal)}</p><div className="mt-4 divide-y divide-slate-100">{summary.tempoPayments.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-4 py-3 text-sm"><div><p className="font-semibold">{payment.customerName || payment.salesId || payment.tempoReceivableId}</p><p className="mt-0.5 text-xs text-slate-500">{payment.paymentMethod} • {payment.rekeningNameSnapshot}</p></div><b>{rupiah(payment.amountPaid)}</b></div>)}</div></section>}
      {summary.tempoReversals.length > 0 && <section className="aj-surface mb-5 p-5"><p className="font-bold text-rose-700">Reversal pembayaran Tempo</p><p className="mt-1 text-sm text-slate-500">{summary.tempoReversals.length} reversal • -{rupiah(summary.tempoReversalTotal)}</p></section>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
        <section className="aj-surface">
          <div className="border-b border-slate-100 p-5">
            <p className="font-bold">Transaksi paid {selectedDate}</p>
            <p className="mt-1 text-sm text-slate-500">Hanya Cash dan TF approved. Transaksi QA tidak ditampilkan.</p>
          </div>
          <div data-testid="reports-mobile-cards" className="space-y-3 p-4 md:hidden">
            {summary.paidSales.map((sale) => (
              <article key={sale.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{sale.customerName}</p>
                    <p className="mt-1 text-xs text-slate-500">{sale.tipeCodeSnapshot || "W"} • {sale.paymentMethod}</p>
                  </div>
                  <p className="shrink-0 font-bold text-slate-900">{rupiah(sale.total)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{sale.paymentMethod}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{sale.syncTarget === "erp" ? sale.syncStatus || "pending" : "local"}</span>
                </div>
              </article>
            ))}
            {summary.paidSales.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Tidak ada transaksi paid pada tanggal ini.</p>}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Tipe</th>
                  <th className="px-5 py-3">Metode</th>
                  <th className="px-5 py-3">ERP</th>
                  <th className="px-5 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.paidSales.map((sale) => (
                  <tr key={sale.id} className="border-b border-slate-100">
                    <td className="px-5 py-4 font-semibold">{sale.customerName}</td>
                    <td className="px-5 py-4">{sale.tipeCodeSnapshot || "W"}</td>
                    <td className="px-5 py-4">{sale.paymentMethod}</td>
                    <td className="px-5 py-4">{sale.syncTarget === "erp" ? sale.syncStatus || "pending" : "local"}</td>
                    <td className="px-5 py-4 text-right">{rupiah(sale.total)}</td>
                  </tr>
                ))}
                {summary.paidSales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-500">Tidak ada transaksi paid pada tanggal ini.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="aj-surface overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <p className="font-bold">Breakdown per tipe</p>
          </div>
          <div className="divide-y divide-slate-100">
            {summary.byTipe.map((row) => (
              <div key={row.tipe} className="p-5">
                <p className="font-bold">{row.tipe}</p>
                <p className="mt-2 text-sm text-slate-600">Cash: {rupiah(row.cash)}</p>
                <p className="text-sm text-slate-600">TF: {rupiah(row.tf)}</p>
                <p className="mt-1 text-sm font-semibold">Total: {rupiah(row.total)}</p>
              </div>
            ))}
            {summary.byTipe.length === 0 && <p className="p-5 text-sm text-slate-500">Belum ada breakdown.</p>}
          </div>
        </section>
      </div>

      <section className="aj-surface mt-5 p-6">
        <p className="mb-3 font-bold">Preview WhatsApp</p>
        <pre className="whitespace-pre-wrap rounded-2xl bg-slate-950 p-5 text-sm leading-7 text-slate-50">{reportText}</pre>
      </section>
    </AppShell>
  );
}
