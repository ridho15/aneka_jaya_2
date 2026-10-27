import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { jakartaDateKey } from "@/lib/date/jakarta";

export async function listSalaryPayments(filters: {
  periodMonth?: string;
  employeeId?: string;
  keyword?: string;
} = {}) {
  const where: Prisma.EmployeeSalaryPaymentWhereInput = {};
  if (filters.periodMonth) where.periodMonth = filters.periodMonth;
  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.keyword?.trim()) {
    const q = filters.keyword.trim();
    where.OR = [
      { employee: { name: { contains: q, mode: "insensitive" } } },
      { employee: { department: { contains: q, mode: "insensitive" } } },
      { notes: { contains: q, mode: "insensitive" } },
      { rekeningNameSnapshot: { contains: q, mode: "insensitive" } }
    ];
  }

  const rows = await prisma.employeeSalaryPayment.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true, department: true, position: true } },
      expenseRecord: { select: { id: true, expenseDate: true, tipeCodeSnapshot: true, approvalStatus: true } }
    },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }]
  });

  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    position: row.employee.position,
    department: row.employee.department,
    periodMonth: row.periodMonth,
    paymentDate: jakartaDateKey(row.paymentDate),
    amountPaid: Number(row.amountPaid),
    rekeningId: row.rekeningId,
    rekeningNameSnapshot: row.rekeningNameSnapshot,
    paymentMethod: row.paymentMethod,
    attachmentUrl: row.attachmentUrl,
    notes: row.notes,
    expenseRecordId: row.expenseRecordId,
    expenseApprovalStatus: row.expenseRecord.approvalStatus,
    createdByUserName: row.createdByNameSnapshot,
    createdAt: row.createdAt.toISOString()
  }));
}

export async function getSalarySummary(periodMonth: string) {
  const payments = await listSalaryPayments({ periodMonth });
  const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
  const employeeIds = new Set(payments.map((p) => p.employeeId));

  return {
    periodMonth,
    totalPaid,
    totalEmployeesPaid: employeeIds.size,
    totalDisbursements: payments.length,
    payments
  };
}

export async function getEmployeeSalaryHistory(employeeId: string) {
  return listSalaryPayments({ employeeId });
}

export type SalaryPaymentRow = Awaited<ReturnType<typeof listSalaryPayments>>[number];
export type SalarySummary = Awaited<ReturnType<typeof getSalarySummary>>;
