import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listBookkeepingTypes, listRekeningAccounts } from "@/lib/business/masterData";
import { RekeningManager } from "@/components/settings/RekeningManager";

export const dynamic = "force-dynamic";

export default async function RekeningPage() {
  const role = await getCurrentRole();
  if (!can(role, "settings.rekening.manage")) redirect("/settings");
  const types = await listBookkeepingTypes();
  const rekenings = await listRekeningAccounts();
  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Super Admin</p>
        <h2 className="aj-page-title text-3xl font-bold">Rekening</h2>
        <p className="mt-2 text-sm text-slate-600">Kelola rekening bank dan kas per tipe. Satu rekening bisa diassign ke banyak tipe.</p>
      </div>
      <RekeningManager types={types} rekenings={rekenings} />
    </AppShell>
  );
}
