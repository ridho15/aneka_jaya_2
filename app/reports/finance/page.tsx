import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { jakartaMonthFromKey } from "@/lib/date/jakarta";
import { getFinanceReport } from "@/lib/reports/store";

export const dynamic = "force-dynamic";

const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export default async function FinanceReportsPage({ searchParams }: { searchParams?: Promise<{ month?: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "reports.finance_view")) redirect("/");

  const params = await searchParams;
  const month = jakartaMonthFromKey(params?.month);
  const summary = await getFinanceReport(month);

  return (
    <AppShell>
      <div className="mb-7">
        <h2 className="aj-page-title text-3xl font-bold">Laporan Finance</h2>
        <p className="mt-2 text-sm text-slate-600">Ringkasan Tempo, pembayaran, dan pengeluaran approved dari PostgreSQL.</p>
      </div>

      <form className="aj-surface mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <label className="text-sm font-semibold text-slate-700">
          <span className="mb-1 block">Bulan laporan</span>
          <input className="w-full rounded-xl border border-slate-300 px-3 py-2 sm:w-auto" type="month" name="month" defaultValue={month} />
        </label>
        <button className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700">Terapkan</button>
      </form>

      <div className="grid gap-5 md:grid-cols-3">
        <section className="aj-surface p-6">
          <p className="text-sm text-slate-500">Open Tempo saat ini</p>
          <p className="mt-2 text-3xl font-black tracking-tight">{rupiah(summary.openTempoTotal)}</p>
          <p className="mt-4 text-sm text-slate-600">{summary.openTempo.length} piutang aktif. Tidak mengikuti filter bulan.</p>
        </section>
        <section className="aj-surface p-6">
          <p className="text-sm text-slate-500">Pembayaran Tempo bulan ini</p>
          <p className="mt-2 text-3xl font-black tracking-tight">{rupiah(summary.tempoPaymentTotal)}</p>
          <p className="mt-4 text-sm text-slate-600">{summary.tempoPayments.length} pembayaran, dikurangi {summary.tempoReversals.length} reversal sebesar {rupiah(summary.tempoReversalTotal)}.</p>
        </section>
        <section className="aj-surface p-6">
          <p className="text-sm text-slate-500">Pengeluaran approved bulan ini</p>
          <p className="mt-2 text-3xl font-black tracking-tight">{rupiah(summary.approvedExpenseTotal)}</p>
          <p className="mt-4 text-sm text-slate-600">{summary.approvedExpenses.length} pengeluaran approved. Pending/rejected tidak masuk.</p>
        </section>
      </div>

      <section className="aj-surface mt-5">
        <div className="border-b border-slate-100 p-5">
          <p className="font-bold">Open Tempo saat ini</p>
          <p className="mt-1 text-sm text-slate-500">Status aktif: open, overdue, partial_paid.</p>
        </div>
        <div data-testid="finance-tempo-mobile-cards" className="space-y-3 p-4 md:hidden">
          {summary.openTempo.map((row) => (
            <article key={row.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{row.customerName}</p>
                  <p className="mt-1 text-xs text-slate-500">{row.tipeCodeSnapshot} • jatuh tempo {row.dueDate}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{row.status}</span>
              </div>
              <p className="mt-3 text-lg font-bold text-slate-900">{rupiah(row.remainingAmount)}</p>
            </article>
          ))}
          {summary.openTempo.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Tidak ada open Tempo.</p>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Tipe</th>
                <th className="px-5 py-3">Jatuh tempo</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Sisa</th>
              </tr>
            </thead>
            <tbody>
              {summary.openTempo.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-5 py-4 font-semibold">{row.customerName}</td>
                  <td className="px-5 py-4">{row.tipeCodeSnapshot}</td>
                  <td className="px-5 py-4">{row.dueDate}</td>
                  <td className="px-5 py-4">{row.status}</td>
                  <td className="px-5 py-4 text-right">{rupiah(row.remainingAmount)}</td>
                </tr>
              ))}
              {summary.openTempo.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">Tidak ada open Tempo.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="aj-surface mt-5">
        <div className="border-b border-slate-100 p-5">
          <p className="font-bold">Pengeluaran approved {month}</p>
        </div>
        <div data-testid="finance-expense-mobile-cards" className="space-y-3 p-4 md:hidden">
          {summary.approvedExpenses.map((row) => (
            <article key={row.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{row.vendorName}</p>
                  <p className="mt-1 text-xs text-slate-500">{row.expenseDate} • {row.tipeCodeSnapshot} • {row.category}</p>
                </div>
                <p className="shrink-0 font-bold text-slate-900">{rupiah(row.amount)}</p>
              </div>
              <p className="mt-3 text-sm text-slate-600">{row.rekeningNameSnapshot}</p>
            </article>
          ))}
          {summary.approvedExpenses.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Tidak ada pengeluaran approved pada bulan ini.</p>}
        </div>
        <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Tanggal</th>
              <th className="px-5 py-3">Tipe</th>
              <th className="px-5 py-3">Rekening</th>
              <th className="px-5 py-3">Kategori</th>
              <th className="px-5 py-3">Vendor</th>
              <th className="px-5 py-3 text-right">Nominal</th>
            </tr>
          </thead>
          <tbody>
            {summary.approvedExpenses.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="px-5 py-4">{row.expenseDate}</td>
                <td className="px-5 py-4">{row.tipeCodeSnapshot}</td>
                <td className="px-5 py-4">{row.rekeningNameSnapshot}</td>
                <td className="px-5 py-4">{row.category}</td>
                <td className="px-5 py-4">{row.vendorName}</td>
                <td className="px-5 py-4 text-right">{rupiah(row.amount)}</td>
              </tr>
            ))}
            {summary.approvedExpenses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-500">Tidak ada pengeluaran approved pada bulan ini.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </AppShell>
  );
}
