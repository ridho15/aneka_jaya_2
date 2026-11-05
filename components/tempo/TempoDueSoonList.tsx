import Link from "next/link";
import { listTempoReceivablesPage, getTempoMetricsSummary } from "@/lib/tempo/store";

const PAGE_SIZE = 20;
const fmtDate = (value: string | Date) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));

function daysLabel(dueDate: string | Date, todayKey: string) {
  const due = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(dueDate)));
  const today = new Date(todayKey);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return { text: "Hari ini", className: "bg-rose-50 text-rose-700 border-rose-200" };
  if (days === 1) return { text: "Besok", className: "bg-amber-50 text-amber-800 border-amber-200" };
  return { text: `${days} hari lagi`, className: "bg-amber-50 text-amber-800 border-amber-200" };
}

/**
 * Tampilan Tempo terbatas (role Admin): hanya nota yang jatuh tempo hari ini s/d 3 hari ke depan,
 * tanpa nominal maupun total.
 */
export async function TempoDueSoonList({ page, keyword }: { page: number; keyword?: string }) {
  const summary = await getTempoMetricsSummary({});
  const { fromDate, toDate } = summary.comingSoonH3;
  const { data, meta } = await listTempoReceivablesPage({ page, pageSize: PAGE_SIZE, filters: { keyword, dueFrom: fromDate, dueTo: toDate } });
  const href = (p: number) => `/tempo?${new URLSearchParams({ ...(keyword ? { keyword } : {}), page: String(p) }).toString()}`;
  return (
    <>
      <div className="mb-6">
        <h2 className="aj-page-title text-3xl font-bold">Nota Jatuh Tempo 3 Hari ke Depan</h2>
        <p className="mt-2 text-sm text-slate-600">Daftar nota tempo yang jatuh tempo hari ini sampai 3 hari ke depan ({fmtDate(fromDate)} – {fmtDate(toDate)}). Hubungi customer sebelum jatuh tempo.</p>
      </div>
      <form className="mb-4 flex gap-2">
        <input name="keyword" defaultValue={keyword} placeholder="Cari customer / no tempo" className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Cari</button>
      </form>
      <section className="aj-surface overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-5 py-3">Customer</th><th className="px-5 py-3">No. Tempo</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Jatuh Tempo</th><th className="px-5 py-3">Sisa Waktu</th></tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const label = daysLabel(row.dueDate, fromDate);
              return (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-5 py-3 font-semibold text-slate-900">{row.customerName}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">{row.id}</td>
                  <td className="px-5 py-3"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{row.tipeCodeSnapshot}</span></td>
                  <td className="px-5 py-3 text-slate-700">{fmtDate(row.dueDate)}</td>
                  <td className="px-5 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${label.className}`}>{label.text}</span></td>
                </tr>
              );
            })}
            {data.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Tidak ada nota yang jatuh tempo dalam 3 hari ke depan.</td></tr>}
          </tbody>
        </table>
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 text-sm">
            {page > 1 && <Link className="rounded-lg border border-slate-300 px-3 py-1.5" href={href(page - 1)}>Sebelumnya</Link>}
            <span className="text-slate-500">Halaman {page} dari {meta.totalPages}</span>
            {page < meta.totalPages && <Link className="rounded-lg border border-slate-300 px-3 py-1.5" href={href(page + 1)}>Berikutnya</Link>}
          </div>
        )}
      </section>
    </>
  );
}
