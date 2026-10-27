import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { EmployeeSubledgerView } from "@/components/sdm/EmployeeSubledgerView";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getCurrentRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getEmployeeLedger, listEmployeeLoans } from "@/lib/sdm/loanStore";
import { listRekeningAccounts } from "@/lib/business/masterData";

export const dynamic = "force-dynamic";

export default async function SdmEmployeeKasbonSubledgerPage({
  params
}: {
  params: Promise<{ employeeId: string }>;
}) {
  await requirePermission("sdm.view");
  const role = await getCurrentRole();
  const canManage = can(role, "sdm.kasbon.manage");

  const { employeeId } = await params;
  const [ledgerData, activeLoans, rekenings] = await Promise.all([
    getEmployeeLedger(employeeId, "KASBON"),
    listEmployeeLoans({ employeeId, loanType: "KASBON", status: "ACTIVE" }),
    listRekeningAccounts()
  ]);

  if (!ledgerData) {
    notFound();
  }

  return (
    <AppShell>
      <EmployeeSubledgerView
        employee={ledgerData.employee}
        activeLoans={activeLoans}
        openBalance={ledgerData.openBalance}
        totalDisbursed={ledgerData.totalDisbursed}
        totalPaid={ledgerData.totalPaid}
        entries={ledgerData.entries}
        rekenings={rekenings}
        canManage={canManage}
      />
    </AppShell>
  );
}
