import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listTempoReceivables } from "@/lib/tempo/store";

export const dynamic = "force-dynamic";

export default async function FinanceReportsPage() {
  const role = await getCurrentRole();
  if (!can(role, "reports.finance_view")) redirect("/");
  const tempo = await listTempoReceivables();
  const openTotal = tempo.filter((row) => !["paid", "cancelled", "written_off"].includes(row.status)).reduce((sum, row) => sum + row.remainingAmount, 0);
  return <AppShell><div className="mb-7"><h2 className="aj-page-title text-3xl font-bold">Laporan Finance</h2><p className="mt-2 text-sm text-slate-600">Ringkasan Tempo dan pergerakan pembayaran.</p></div><section className="aj-surface p-6"><p className="text-sm text-slate-500">Open Tempo</p><p className="mt-2 text-4xl font-black tracking-tight">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(openTotal)}</p><p className="mt-4 text-sm text-slate-600">Tempo tetap muncul sampai status Paid, Cancelled, atau Written Off.</p></section></AppShell>;
}
