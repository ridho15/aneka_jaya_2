import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { InventoryHeader } from "@/components/inventory/ui";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { jakartaDateKey } from "@/lib/date/jakarta";
import { getWarehouseRequests } from "@/lib/reports/warehouseRequests";

export const dynamic = "force-dynamic";

const qty = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
const dayLabel = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "2-digit", month: "short", year: "numeric" });
const timeLabel = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });

export default async function WarehouseRequestPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const role = await getCurrentRole();
  if (!can(role, "inventory.stock.view")) redirect("/no-access");
  const p = await searchParams;
  const today = jakartaDateKey(new Date());
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const from = valid(p.from) ?? today;
  const to = valid(p.to) ?? today;
  const report = await getWarehouseRequests({ from, to });
  const input = "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <AppShell>
      <InventoryHeader
        title="Permintaan Barang Gudang"
        description="Barang yang terjual tetapi stoknya tidak ada di toko, sehingga dipotong dari gudang. Ambil barang ini dari gudang untuk diserahkan ke pembeli."
      />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-700">Dari<input type="date" name="from" defaultValue={from} className={`${input} mt-1 block`} /></label>
        <label className="text-xs font-semibold text-slate-700">Sampai<input type="date" name="to" defaultValue={to} className={`${input} mt-1 block`} /></label>
        <button className="min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Terapkan</button>
      </form>

      <section className="aj-surface mb-5 overflow-x-auto">
        <h3 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">Yang perlu diambil dari gudang</h3>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-2">Barang</th><th className="px-4 py-2">Gudang</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Nota</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {report.products.map((r) => (
              <tr key={`${r.sku}|${r.warehouse}`}>
                <td className="px-4 py-2"><span className="font-mono text-xs text-slate-500">{r.sku}</span> {r.name}</td>
                <td className="px-4 py-2">{r.warehouse}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums">{qty(r.quantity)} {r.unit}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.notaCount}</td>
              </tr>
            ))}
            {!report.products.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Tidak ada barang yang perlu diambil dari gudang.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="aj-surface divide-y divide-slate-100">
        <h3 className="px-4 py-3 font-semibold text-slate-900">Per nota</h3>
        {report.sales.map((s, index) => (
          <div key={s.saleId ?? `${s.dayKey}-${index}`}>
            {(index === 0 || report.sales[index - 1].dayKey !== s.dayKey) && (
              <p className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">
                {dayLabel.format(new Date(`${s.dayKey}T00:00:00+07:00`))}<span className="font-normal text-slate-500"> · {report.dayCounts.get(s.dayKey)} nota</span>
              </p>
            )}
            <div className="px-4 py-2.5 text-sm">
              <p className="truncate">
                <span className="font-semibold text-slate-900">{s.customerName}</span>
                <span className="text-xs text-slate-500"> · {s.transactionAt ? timeLabel.format(new Date(s.transactionAt)) : s.dayKey}{s.transactionNumber ? ` · ${s.transactionNumber}` : ""}{s.createdBy ? ` · oleh ${s.createdBy}` : ""}</span>
              </p>
              <ul className="mt-0.5 text-xs text-slate-600">
                {s.lines.map((l, i) => <li key={i}><span className="font-mono">{l.sku}</span> {l.name} · <b>{qty(l.quantity)} {l.unit}</b> dari {l.warehouse}</li>)}
              </ul>
              {s.saleId && <Link href={`/penjualan/${s.saleId}`} className="inline-flex min-h-8 items-center text-xs font-semibold text-emerald-800 underline">Detail nota</Link>}
            </div>
          </div>
        ))}
        {!report.sales.length && <p className="px-4 py-6 text-center text-sm text-slate-500">Belum ada penjualan yang diambil dari gudang di periode ini.</p>}
      </section>
    </AppShell>
  );
}
