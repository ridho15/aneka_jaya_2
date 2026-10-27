import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/store";
import type { Role } from "@/lib/auth/roles";

export type OrgHierarchyNode = {
  id: string;
  nik: string | null;
  name: string;
  position: string;
  department: string;
  isActive: boolean;
  managerId: string | null;
  subordinateCount: number;
  children: OrgHierarchyNode[];
};

export async function getOrganizationHierarchy(): Promise<{
  roots: OrgHierarchyNode[];
  totalEmployees: number;
  departmentCounts: Record<string, number>;
}> {
  const employees = await prisma.employee.findMany({
    orderBy: [{ department: "asc" }, { name: "asc" }]
  });

  const departmentCounts: Record<string, number> = {};
  for (const emp of employees) {
    departmentCounts[emp.department] = (departmentCounts[emp.department] || 0) + 1;
  }

  const nodeMap = new Map<string, OrgHierarchyNode>();
  for (const emp of employees) {
    nodeMap.set(emp.id, {
      id: emp.id,
      nik: emp.nik,
      name: emp.name,
      position: emp.position,
      department: emp.department,
      isActive: emp.isActive,
      managerId: emp.managerId,
      subordinateCount: 0,
      children: []
    });
  }

  const roots: OrgHierarchyNode[] = [];
  for (const emp of employees) {
    const node = nodeMap.get(emp.id)!;
    if (emp.managerId && nodeMap.has(emp.managerId)) {
      nodeMap.get(emp.managerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Calculate recursive subordinate count
  function countSubordinates(node: OrgHierarchyNode): number {
    let count = 0;
    for (const child of node.children) {
      count += 1 + countSubordinates(child);
    }
    node.subordinateCount = count;
    return count;
  }

  for (const root of roots) {
    countSubordinates(root);
  }

  return {
    roots,
    totalEmployees: employees.length,
    departmentCounts
  };
}

export async function assignSupervisor(
  employeeId: string,
  supervisorId: string | null,
  actor: { id: string; name: string; role: Role }
) {
  if (supervisorId && employeeId === supervisorId) {
    throw new Error("Karyawan tidak dapat menjadi atasan untuk dirinya sendiri.");
  }

  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new Error("Data karyawan tidak ditemukan.");

  if (supervisorId) {
    const supervisor = await prisma.employee.findUnique({ where: { id: supervisorId } });
    if (!supervisor) throw new Error("Data atasan yang dipilih tidak ditemukan.");

    // Cycle detection: ensure supervisor is not currently a descendant/subordinate of employeeId
    const isDescendant = await checkIfSubordinate(supervisorId, employeeId);
    if (isDescendant) {
      throw new Error("Tidak dapat menetapkan atasan: terjadi hierarki melingkar (siklik).");
    }
  }

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data: {
      managerId: supervisorId,
      updatedAt: new Date()
    },
    include: {
      manager: { select: { id: true, name: true, position: true } }
    }
  });

  await recordAudit({
    entityType: "employee",
    entityId: employeeId,
    action: "assign_supervisor",
    beforeValue: { managerId: emp.managerId },
    afterValue: { managerId: supervisorId },
    reason: `Penetapan atasan langsung untuk ${emp.name} menjadi ${updated.manager?.name || "Tanpa Atasan"}`
  });

  return updated;
}

async function checkIfSubordinate(candidateSupervisorId: string, employeeId: string): Promise<boolean> {
  let currentId: string | null = candidateSupervisorId;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    if (currentId === employeeId) {
      return true;
    }

    const parent: { managerId: string | null } | null = await prisma.employee.findUnique({
      where: { id: currentId },
      select: { managerId: true }
    });

    currentId = parent?.managerId || null;
  }

  return false;
}
