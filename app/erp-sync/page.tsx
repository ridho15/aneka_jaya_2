import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";

export default async function ErpSyncPage() {
  const role = await getCurrentRole();
  if (!can(role, "erp_sync.retry")) redirect("/");
  return <AppShell><div className="mb-7"><h2 className="aj-page-title text-3xl font-bold">ERP Sync</h2><p className="mt-2 text-sm text-slate-600">Super Admin dapat retry sinkronisasi ERP dari job route yang dilindungi CRON_SECRET.</p></div><section className="aj-surface p-6 text-sm text-slate-600">Endpoint retry: <code>/api/jobs/retry-erp-sync</code>. Token ERP tetap server-side.</section></AppShell>;
}
