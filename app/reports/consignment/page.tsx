import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentRole } from "@/lib/auth/session";
import { jakartaDateKey } from "@/lib/date/jakarta";
import { getConsignmentReport } from "@/lib/reports/consignmentReport";

export const dynamic = "force-dynamic";

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const qty = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
const dayLabel = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "2-digit", month: "short", year: "numeric" });
const timeLabel = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });

export default async function ConsignmentReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; keyword?: string }> }) {
  // Laporan owner: angka rupiah hanya untuk Super Admin.
  if ((await getCurrentRole()) !== "OWNER") redirect("/no-access");
  const p = await searchParams;
  const today = jakartaDateKey(new Date());
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const from = valid(p.from) ?? `${today.slice(0, 7)}-01`;
  const to = valid(p.to) ?? today;
  const report = await getConsignmentReport({ from, to, keyword: p.keyword });
  const input = "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <AppShell>
      <div className="mb-5">
        <h2 className="aj-page-title text-3xl font-bold">Laporan Consignment</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Barang yang terjual saat stoknya kosong. Qty yang tercatat hanya bagian yang melebihi stok saat itu. Stok lokasinya menjadi minus sampai barang masuk atau opname.
        </p>
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-700">Dari<input type="date" name="from" defaultValue={from} className={`${input} mt-1 block`} /></label>
        <label className="text-xs font-semibold text-slate-700">Sampai<input type="date" name="to" defaultValue={to} className={`${input} mt-1 block`} /></label>
        <label className="min-w-48 flex-1 text-xs font-semibold text-slate-700">Cari<input name="keyword" defaultValue={p.keyword} placeholder="Customer / no transaksi / barang" className={`${input} mt-1 block w-full`} /></label>
        <button className="min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Terapkan</button>
      </form>

      <section className="aj-surface">
        <p className="border-b border-slate-200 px-4 py-3 text-sm text-slate-700">
          {report.totals.notaCount} nota · {report.totals.items} baris barang · <b>{rupiah(report.totals.total)}</b>
        </p>
        {/* Per hari bisa dilipat: hanya hari terbaru yang terbuka, hari sebelumnya cukup satu baris. */}
        <div className="divide-y divide-slate-200">
          {report.days.map((day, dayIndex) => (
            <details key={day.dayKey} open={dayIndex === 0} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 bg-slate-50 px-4 py-2 text-xs hover:bg-slate-100">
                <span>
                  <span className="mr-1.5 inline-block text-slate-400 transition-transform group-open:rotate-90">›</span>
                  <span className="font-semibold text-slate-700">{dayLabel.format(new Date(`${day.dayKey}T00:00:00+07:00`))}</span>
                  <span className="text-slate-500"> · {day.notaCount} nota · {qty(day.quantity)} satuan</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-800">{rupiah(day.total)}</span>
              </summary>
              <div className="divide-y divide-slate-100">
                {report.sales.filter((s) => s.dayKey === day.dayKey).map((s, index) => (
                  <details key={s.saleId ?? `${s.dayKey}-${index}`} className="group/nota">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-slate-50">
                      <span className="min-w-0 truncate">
                        <span className="mr-1.5 inline-block text-slate-400 transition-transform group-open/nota:rotate-90">›</span>
                        <span className="font-semibold text-slate-900">{s.customerName}</span>
                        <span className="text-xs text-slate-500"> · {s.transactionAt ? timeLabel.format(new Date(s.transactionAt)) : s.saleDate}{s.transactionNumber ? ` · ${s.transactionNumber}` : ""} · {s.lines.length} barang{s.createdBy ? ` · oleh ${s.createdBy}` : ""}</span>
                      </span>
                      <span className="shrink-0 font-bold tabular-nums">{rupiah(s.total)}</span>
                    </summary>
                    <div className="px-4 pb-2.5 pl-8">
                      <ul className="space-y-0.5 text-xs text-slate-600">
                        {s.lines.map((l, i) => (
                          <li key={i} className="flex justify-between gap-3">
                            <span className="min-w-0 truncate"><span className="font-mono">{l.sku}</span> {l.name} · {qty(l.quantity)} {l.unit} × {rupiah(l.unitPrice)} · {l.location}</span>
                            <span className="shrink-0 tabular-nums">{rupiah(l.amount)}</span>
                          </li>
                        ))}
                      </ul>
                      {s.saleId && <Link href={`/penjualan/${s.saleId}`} className="mt-1 inline-flex min-h-8 items-center text-xs font-semibold text-emerald-800 underline">Detail nota</Link>}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
          {!report.sales.length && <p className="px-4 py-8 text-center text-sm text-slate-500">Tidak ada penjualan barang tanpa stok di periode ini.</p>}
        </div>
      </section>
    </AppShell>
  );
}
