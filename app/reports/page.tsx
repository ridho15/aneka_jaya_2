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
      <div className="mb-7">
        <h2 className="aj-page-title text-3xl font-bold">Laporan</h2>
        <p className="mt-2 text-sm text-slate-600">Laporan harian paid sales dari PostgreSQL. Grand Total exclude Tempo dan transaksi QA.</p>
      </div>

      <form className="aj-surface mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <label className="text-sm font-semibold text-slate-700">
          <span className="mb-1 block">Tanggal laporan</span>
          <input className="rounded-xl border border-slate-300 px-3 py-2" type="date" name="date" defaultValue={selectedDate} />
        </label>
        <button className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700">Terapkan</button>
      </form>

      <div className="mb-5 grid gap-4 lg:grid-cols-4 md:grid-cols-2">
        <section className="aj-surface p-5">
          <p className="text-sm text-slate-500">Grand Total paid</p>
          <p className="mt-2 text-2xl font-black">{rupiah(summary.grandTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">Exclude Tempo & QA</p>
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
        <section className="aj-surface overflow-x-auto">
          <div className="border-b border-slate-100 p-5">
            <p className="font-bold">Transaksi paid {selectedDate}</p>
            <p className="mt-1 text-sm text-slate-500">Hanya Cash dan TF approved. Transaksi QA tidak ditampilkan.</p>
          </div>
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
