import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { getOrganizationHierarchy } from "@/lib/sdm/hierarchyStore";
import { OrgChartViewer } from "@/components/sdm/OrgChartViewer";

export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  await requirePermission("sdm.view");
  const user = await getCurrentUser();
  const canManage = can(user.role, "sdm.employee.manage");

  const [hierarchy, allEmployees] = await Promise.all([
    getOrganizationHierarchy(),
    prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, name: true, position: true, department: true },
      orderBy: { name: "asc" }
    })
  ]);

  return (
    <AppShell>
      <div className="mb-6">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.13em] text-emerald-400">
          SDM & STRUKTUR
        </p>
        <h2 className="aj-page-title text-3xl font-bold">Bagan Struktur Organisasi</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hierarki atasan dan bawahan langsung karyawan PT Surya Logam Mulia, dilengkapi rincian jumlah bawahan per divisi.
        </p>
      </div>

      <OrgChartViewer
        initialRoots={hierarchy.roots}
        totalEmployees={hierarchy.totalEmployees}
        departmentCounts={hierarchy.departmentCounts}
        allEmployees={allEmployees}
        canManage={canManage}
      />
    </AppShell>
  );
}
