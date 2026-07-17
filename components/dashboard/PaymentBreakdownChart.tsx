"use client";
import Link from "next/link";
import { useState } from "react";
import { formatDashboardMoney, type PaymentBreakdown } from "@/lib/dashboard/summary";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const colors = ["#10b981", "#2563eb", "#06b6d4", "#f59e0b", "#ec4899"];
type LinkFilters = { from?: string; to?: string };
export type PaymentPeriod = {
  mode: "day" | "day-range";
  day: string; from: string; to: string;
  label: string; transactionCount: number; error?: string;
};
const defaultPeriod: PaymentPeriod = { mode: "day-range", day: "", from: "", to: "", label: "Semua periode", transactionCount: 0 };

function paymentRowHref(item: PaymentBreakdown["cash"], filters?: LinkFilters) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  params.set("paymentMethod", item.paymentMethod);
  params.set("approvalStatus", "approved");
  if (item.rekeningId && item.rekeningId !== "cash") params.set("rekening", item.rekeningId);
  return `/penjualan?${params.toString()}`;
}

export function PaymentBreakdownChart({ data, filters, period = defaultPeriod, preservedParams = {} }: { data: PaymentBreakdown; filters?: LinkFilters; period?: PaymentPeriod; preservedParams?: Record<string, string> }) {
  const [mode, setMode] = useState(period.mode);
  const rows = [data.cash, ...data.transfers.map((row) => ({ ...row, label: `TF: ${row.label}` }))].filter((row) => row.value > 0);
  const gradient = rows.map((item, index) => {
    const start = rows.slice(0, index).reduce((sum, entry) => sum + entry.percentage, 0);
    return `${colors[index % colors.length]} ${start}% ${start + item.percentage}%`;
  }).join(", ");
  const resetQuery = new URLSearchParams(preservedParams).toString();

  return <section data-testid="dashboard-payment-breakdown" className="aj-surface p-5 sm:p-6">
    <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">PEMBAYARAN</p>
    <h2 className="mt-1 text-lg font-bold tracking-tight">Cash & transfer</h2>
    <form className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3">
      <input type="hidden" name="paymentPeriod" value={mode} />
      {Object.entries(preservedParams).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <Select aria-label="Mode periode pembayaran" value={mode} onChange={(event) => setMode(event.target.value as PaymentPeriod["mode"])}><option value="day">Satu tanggal</option><option value="day-range">Rentang tanggal</option></Select>
      {mode === "day" && <Input aria-label="Tanggal pembayaran" type="date" name="paymentDate" defaultValue={period.day} />}
      {mode === "day-range" && <div className="grid grid-cols-2 gap-2"><Input aria-label="Tanggal awal pembayaran" type="date" name="paymentFrom" defaultValue={period.from} /><Input aria-label="Tanggal akhir pembayaran" type="date" name="paymentTo" defaultValue={period.to} /></div>}
      <div className="flex items-center gap-3"><button className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white" type="submit">Terapkan</button><Link className="text-xs font-semibold text-slate-600" href={resetQuery ? `/dashboard?${resetQuery}` : "/dashboard"}>Reset periode</Link></div>
    </form>
    <p className="mt-3 text-xs text-slate-500">{period.label} • {period.transactionCount} transaksi approved</p>
    {period.error && <p className="mt-2 text-xs font-semibold text-red-600">{period.error}</p>}
    {rows.length === 0 ? <div className="grid h-40 place-items-center text-sm text-slate-500">Belum ada transaksi Cash/TF approved pada periode ini.</div> : <div className="mt-6 flex items-center gap-5"><div className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${gradient})` }}><div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center"><b className="text-xl">100%</b><span className="text-[10px] text-slate-500">Paid</span></div></div><div className="min-w-0 flex-1 space-y-2.5">{rows.map((item, index) => <Link key={item.label} href={paymentRowHref(item, filters)} data-testid="dashboard-payment-breakdown-row" data-label={item.label} data-value={formatDashboardMoney(item.value)} className="-mx-2 block rounded-md px-2 py-1 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2" title={`Lihat transaksi ${item.label}`}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="flex min-w-0 items-center gap-1.5 text-slate-600"><i className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="truncate">{item.label}</span></span><b className="shrink-0">{Math.round(item.percentage)}%</b></div><div className="mb-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${item.percentage}%`, backgroundColor: colors[index % colors.length] }} /></div><p className="text-right text-xs font-semibold text-slate-700">{formatDashboardMoney(item.value)}</p></Link>)}</div></div>}
  </section>;
}
