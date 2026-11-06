import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getFixedAssetPolicy, listFixedAssets } from "@/lib/accounting/fixedAssets";
import { FixedAssetsView } from "@/components/accounting/FixedAssetsView";
import { jakartaMonthKey } from "@/lib/date/jakarta";

export const dynamic = "force-dynamic";

export default async function FixedAssetsPage() {
  await requirePermission("accounting.view");
  const role = await getCurrentRole();
  const [assets, policy] = await Promise.all([listFixedAssets(), getFixedAssetPolicy()]);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="aj-page-title text-3xl font-bold">Aset Tetap</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Peralatan yang dipakai usaha. Aset baru masuk otomatis dari Pengeluaran bertujuan Peralatan. Lengkapi lokasi, tanggal siap pakai, umur dan nilai residu; aset yang belum lengkap tidak disusutkan.
        </p>
      </div>
      <FixedAssetsView
        assets={assets.map((a) => ({ ...a, acquisitionDate: iso(a.acquisitionDate), availableForUseDate: iso(a.availableForUseDate), createdAt: undefined, updatedAt: undefined }))}
        policy={policy}
        canManage={can(role, "accounting.journal.manage")}
        defaultPeriod={jakartaMonthKey(new Date())}
      />
    </AppShell>
  );
}
