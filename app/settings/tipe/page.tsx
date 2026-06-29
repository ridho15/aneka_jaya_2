import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { listBookkeepingTypes, listRekeningAccounts } from "@/lib/business/masterData";
import { TipeManager } from "@/components/settings/TipeManager";

export const dynamic = "force-dynamic";

export default async function TipePage() {
  const role = await getCurrentRole();
  if (!can(role, "settings.tipe.manage")) redirect("/settings");
  const types = await listBookkeepingTypes();
  const rekenings = await listRekeningAccounts();
  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Super Admin</p>
        <h2 className="aj-page-title text-3xl font-bold">Tipe Pembukuan</h2>
        <p className="mt-2 text-sm text-slate-600">Kelola tipe transaksi (W, SLM, Online, dll). Tipe yang sudah punya transaksi tidak dihapus — nonaktifkan saja.</p>
      </div>
      <TipeManager types={types} rekenings={rekenings} />
    </AppShell>
  );
}
