import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { formatDailyReport } from "@/lib/whatsapp/reportFormatter";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const role = await getCurrentRole();
  if (!can(role, "reports.view")) redirect("/");
  const report = await formatDailyReport(new Date());
  return <AppShell><div className="mb-7"><h2 className="aj-page-title text-3xl font-bold">Laporan</h2><p className="mt-2 text-sm text-slate-600">Preview Laporan Harian. Grand Total exclude Tempo.</p></div><section className="aj-surface p-6"><pre className="whitespace-pre-wrap rounded-2xl bg-slate-950 p-5 text-sm leading-7 text-slate-50">{report}</pre></section></AppShell>;
}
