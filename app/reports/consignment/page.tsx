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
  const dayOf = new Map(report.days.map((d) => [d.dayKey, d]));
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
        <div className="divide-y divide-slate-100">
          {report.sales.map((s, index) => {
            const newDay = index === 0 || report.sales[index - 1].dayKey !== s.dayKey;
            const day = dayOf.get(s.dayKey);
            return (
              <div key={s.saleId ?? `${s.dayKey}-${index}`}>
                {newDay && day && (
                  <p className="bg-slate-50 px-4 py-2 text-xs">
                    <span className="font-semibold text-slate-700">{dayLabel.format(new Date(`${s.dayKey}T00:00:00+07:00`))}</span>
                    <span className="text-slate-500"> · {day.notaCount} nota · {qty(day.quantity)} satuan · {rupiah(day.total)}</span>
                  </p>
                )}
                <div className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm">
                      <span className="font-semibold text-slate-900">{s.customerName}</span>
                      <span className="text-xs text-slate-500"> · {s.transactionAt ? timeLabel.format(new Date(s.transactionAt)) : s.saleDate}{s.transactionNumber ? ` · ${s.transactionNumber}` : ""}{s.createdBy ? ` · oleh ${s.createdBy}` : ""}</span>
                    </p>
                    <p className="shrink-0 text-sm font-bold tabular-nums">{rupiah(s.total)}</p>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                    {s.lines.map((l, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate"><span className="font-mono">{l.sku}</span> {l.name} · {qty(l.quantity)} {l.unit} × {rupiah(l.unitPrice)} · {l.location}</span>
                        <span className="shrink-0 tabular-nums">{rupiah(l.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  {s.saleId && <Link href={`/penjualan/${s.saleId}`} className="mt-1 inline-flex min-h-8 items-center text-xs font-semibold text-emerald-800 underline">Detail nota</Link>}
                </div>
              </div>
            );
          })}
          {!report.sales.length && <p className="px-4 py-8 text-center text-sm text-slate-500">Tidak ada penjualan barang tanpa stok di periode ini.</p>}
        </div>
      </section>
    </AppShell>
  );
}
