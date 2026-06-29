import { AppShell } from "@/components/layout/AppShell";
import { PengeluaranForm } from "@/components/forms/PengeluaranForm";
import { listBookkeepingTypes, listRekeningAccounts } from "@/lib/business/masterData";
import { requirePermission } from "@/lib/auth/requirePermission";

export const dynamic = "force-dynamic";

export default async function InputPengeluaranPage() {
  await requirePermission("pengeluaran.create");
  const [tipes, rekenings] = await Promise.all([listBookkeepingTypes(), listRekeningAccounts()]);
  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-neutral-500">Keuangan</p>
        <h2 className="aj-page-title text-3xl font-bold">Input Pengeluaran</h2>
        <p className="mt-2 text-sm text-slate-600">Catat pengeluaran perusahaan beserta bukti pembayarannya.</p>
      </div>
      <PengeluaranForm tipes={tipes} rekenings={rekenings} />
    </AppShell>
  );
}
