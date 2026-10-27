import { AppShell } from "@/components/layout/AppShell";
import { KasbonOverviewTable } from "@/components/sdm/KasbonOverviewTable";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listEmployeeLoanOverview } from "@/lib/sdm/loanStore";

export const dynamic = "force-dynamic";

export default async function SdmKasbonPage() {
  await requirePermission("sdm.view");
  const overview = await listEmployeeLoanOverview("KASBON");

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">SDM & Keuangan</p>
        <h2 className="aj-page-title text-3xl font-bold">Kasbon Karyawan</h2>
        <p className="mt-2 text-sm text-slate-600">
          Ringkasan piutang kasbon karyawan, saldo terbuka yang belum lunas, dan histori buku pembantu.
        </p>
      </div>

      <KasbonOverviewTable overview={overview} />
    </AppShell>
  );
}
