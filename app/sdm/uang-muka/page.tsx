import { AppShell } from "@/components/layout/AppShell";
import { AdvanceOverviewTable } from "@/components/sdm/AdvanceOverviewTable";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getCurrentRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listEmployeeLoans } from "@/lib/sdm/loanStore";
import { listRekeningAccounts } from "@/lib/business/masterData";

export const dynamic = "force-dynamic";

export default async function SdmUangMukaPage() {
  await requirePermission("sdm.view");
  const role = await getCurrentRole();
  const canManage = can(role, "sdm.kasbon.manage");

  const [loans, rekenings] = await Promise.all([
    listEmployeeLoans({ loanType: "UANG_MUKA" }),
    listRekeningAccounts()
  ]);

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">SDM & Operasional</p>
        <h2 className="aj-page-title text-3xl font-bold">Uang Muka Operasional</h2>
        <p className="mt-2 text-sm text-slate-600">
          Monitoring uang muka dinas karyawan, verifikasi nota fisik pengeluaran riil, dan pencatatan pengembalian sisa kas.
        </p>
      </div>

      <AdvanceOverviewTable loans={loans} rekenings={rekenings} canManage={canManage} />
    </AppShell>
  );
}
