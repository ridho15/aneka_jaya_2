import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getInventoryReconciliation } from "@/lib/accounting/inventoryReconciliation";
import { InventoryReconciliationView } from "@/components/accounting/InventoryReconciliationView";

export const dynamic = "force-dynamic";

export default async function InventoryPolicyPage() {
  await requirePermission("accounting.view");
  const role = await getCurrentRole();
  const report = await getInventoryReconciliation();
  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="aj-page-title text-3xl font-bold">Persediaan & Kebijakan</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">Cocokkan nilai stok dengan buku besar, telusuri asal selisih, dan tinjau koreksi pembelian lama.</p>
      </div>
      <InventoryReconciliationView report={JSON.parse(JSON.stringify(report))} canManage={can(role, "accounting.journal.manage")} />
    </AppShell>
  );
}
