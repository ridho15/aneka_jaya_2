import { AppShell } from "@/components/layout/AppShell";
import { EmployeeManager } from "@/components/sdm/EmployeeManager";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getCurrentRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listEmployees, getOrganizationTree } from "@/lib/sdm/employeeStore";

export const dynamic = "force-dynamic";

export default async function SdmKaryawanPage() {
  await requirePermission("sdm.view");
  const role = await getCurrentRole();
  const canManage = can(role, "sdm.employee.manage");

  const [employees, orgTree] = await Promise.all([
    listEmployees(),
    getOrganizationTree()
  ]);

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">SDM & Personalia</p>
        <h2 className="aj-page-title text-3xl font-bold">Data Karyawan & Organisasi</h2>
        <p className="mt-2 text-sm text-slate-600">
          Kelola master data karyawan, posisi, atasan langsung, dan bagan hierarki organisasi perusahaan.
        </p>
      </div>

      <EmployeeManager
        initialEmployees={employees}
        initialOrgTree={orgTree}
        canManage={canManage}
      />
    </AppShell>
  );
}
