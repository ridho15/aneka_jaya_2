import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import type { EmployeeInput } from "@/lib/validation/sdmSchema";
import { recordAudit } from "@/lib/audit/store";
import type { Role } from "@/lib/auth/roles";

export type EmployeeRow = {
  id: string;
  nik: string | null;
  name: string;
  position: string;
  department: string;
  managerId: string | null;
  isActive: boolean;
  bankName: string | null;
  bankAccountNumber: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  manager?: { id: string; name: string; position: string } | null;
};

export type OrgNode = {
  id: string;
  name: string;
  position: string;
  department: string;
  isActive: boolean;
  children: OrgNode[];
};

export async function listEmployees(filters: { isActive?: boolean; department?: string; keyword?: string } = {}): Promise<EmployeeRow[]> {
  const where: Prisma.EmployeeWhereInput = {};
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.department) where.department = filters.department;
  if (filters.keyword?.trim()) {
    const q = filters.keyword.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { position: { contains: q, mode: "insensitive" } },
      { department: { contains: q, mode: "insensitive" } },
      { nik: { contains: q, mode: "insensitive" } }
    ];
  }
  return prisma.employee.findMany({
    where,
    include: { manager: { select: { id: true, name: true, position: true } } },
    orderBy: [{ isActive: "desc" }, { department: "asc" }, { name: "asc" }]
  });
}

export async function getEmployee(id: string) {
  return prisma.employee.findUnique({
    where: { id },
    include: {
      manager: { select: { id: true, name: true, position: true } },
      subordinates: { select: { id: true, name: true, position: true, isActive: true } }
    }
  });
}

export async function createEmployee(input: EmployeeInput, actor: { id: string; name: string; role: Role }) {
  const employee = await prisma.employee.create({
    data: {
      nik: input.nik || null,
      name: input.name,
      position: input.position,
      department: input.department,
      managerId: input.managerId || null,
      isActive: input.isActive ?? true,
      bankName: input.bankName || null,
      bankAccountNumber: input.bankAccountNumber || null,
      notes: input.notes || null
    }
  });

  await recordAudit({
    entityType: "employee",
    entityId: employee.id,
    action: "create",
    afterValue: employee,
    reason: `Tambah data karyawan: ${employee.name} (${employee.position} - ${employee.department})`
  });

  return employee;
}

export async function updateEmployee(id: string, input: EmployeeInput, actor: { id: string; name: string; role: Role }) {
  const before = await prisma.employee.findUnique({ where: { id } });
  if (!before) throw new Error("Karyawan tidak ditemukan.");

  // Cegah atasan menjadi dirinya sendiri
  if (input.managerId && input.managerId === id) {
    throw new Error("Karyawan tidak dapat menjadi atasan untuk dirinya sendiri.");
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      nik: input.nik || null,
      name: input.name,
      position: input.position,
      department: input.department,
      managerId: input.managerId || null,
      isActive: input.isActive ?? true,
      bankName: input.bankName || null,
      bankAccountNumber: input.bankAccountNumber || null,
      notes: input.notes || null
    }
  });

  await recordAudit({
    entityType: "employee",
    entityId: id,
    action: "update",
    beforeValue: before,
    afterValue: employee,
    reason: `Update data karyawan: ${employee.name}`
  });

  return employee;
}

export async function getOrganizationTree(): Promise<OrgNode[]> {
  const employees = await prisma.employee.findMany({
    orderBy: [{ name: "asc" }]
  });

  const nodeMap = new Map<string, OrgNode>();
  for (const emp of employees) {
    nodeMap.set(emp.id, {
      id: emp.id,
      name: emp.name,
      position: emp.position,
      department: emp.department,
      isActive: emp.isActive,
      children: []
    });
  }

  const rootNodes: OrgNode[] = [];
  for (const emp of employees) {
    const node = nodeMap.get(emp.id)!;
    if (emp.managerId && nodeMap.has(emp.managerId)) {
      nodeMap.get(emp.managerId)!.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  return rootNodes;
}

export const getEmployeeById = getEmployee;

export async function deleteEmployee(id: string, actor: { id: string; name: string; role: Role }) {
  const before = await prisma.employee.findUnique({
    where: { id },
    include: { loans: true, salaryPayments: true, subordinates: true }
  });
  if (!before) throw new Error("Karyawan tidak ditemukan.");

  // If employee has relations, soft delete by toggling isActive: false
  if (before.loans.length > 0 || before.salaryPayments.length > 0 || before.subordinates.length > 0) {
    const updated = await prisma.employee.update({
      where: { id },
      data: { isActive: false }
    });
    await recordAudit({
      entityType: "employee",
      entityId: id,
      action: "update",
      beforeValue: before,
      afterValue: updated,
      reason: `Nonaktifkan karyawan karena memiliki riwayat transaksi/bawahan: ${before.name}`
    });
    return updated;
  }

  // Hard delete if clean
  await prisma.employee.delete({ where: { id } });
  await recordAudit({
    entityType: "employee",
    entityId: id,
    action: "archive",
    beforeValue: before,
    reason: `Hapus data karyawan: ${before.name}`
  });
  return before;
}
