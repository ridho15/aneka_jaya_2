import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listTempoReceivables } from "@/lib/tempo/store";

export const dynamic = "force-dynamic";

export default async function TempoPage() {
  const role = await getCurrentRole();
  if (!can(role, "tempo.view")) redirect("/");
  const rows = await listTempoReceivables();
  const openRows = rows.filter((row) => !["paid", "cancelled", "written_off"].includes(row.status));
  const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
  return <AppShell><div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Piutang</p><h2 className="aj-page-title text-3xl font-bold">Tempo</h2><p className="mt-2 text-sm text-slate-600">Open Tempo tetap muncul sampai Paid, Cancelled, atau Written Off.</p></div><section className="aj-surface overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Original</th><th className="px-5 py-3">Paid</th><th className="px-5 py-3">Remaining</th><th className="px-5 py-3">Jatuh Tempo</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Action</th></tr></thead><tbody>{openRows.map((row) => <tr key={row.id} className="border-b border-slate-100"><td className="px-5 py-4 font-semibold">{row.customerName}</td><td className="px-5 py-4">{row.tipeCodeSnapshot}</td><td className="px-5 py-4">{rupiah(row.originalAmount)}</td><td className="px-5 py-4">{rupiah(row.paidAmount)}</td><td className="px-5 py-4">{rupiah(row.remainingAmount)}</td><td className="px-5 py-4">{new Intl.DateTimeFormat("id-ID").format(new Date(row.dueDate))}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === "overdue" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>{row.status}</span></td><td className="px-5 py-4"><a href={`/tempo/${row.id}`} className="font-semibold text-emerald-700 hover:text-emerald-800">Detail / Bayar</a></td></tr>)}{openRows.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500">Tidak ada Tempo terbuka.</td></tr>}</tbody></table></section></AppShell>;
}
