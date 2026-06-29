import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/auth/roles";
import type { Expense } from "@/lib/types/expenses";

type ExpenseRecordRow = Prisma.ExpenseRecordGetPayload<object>;

export function toExpense(row: ExpenseRecordRow): Expense {
  return {
    id: row.id,
    expenseDate: row.expenseDate.toISOString().slice(0, 10),
    tipeId: row.tipeId,
    tipeCodeSnapshot: row.tipeCodeSnapshot,
    tipeNameSnapshot: row.tipeNameSnapshot,
    rekeningId: row.rekeningId,
    rekeningNameSnapshot: row.rekeningNameSnapshot,
    coaId: row.coaId,
    coaNameSnapshot: row.coaNameSnapshot,
    category: row.category,
    vendorName: row.vendorName,
    description: row.description,
    amount: Number(row.amount),
    paymentMethod: row.paymentMethod,
    attachmentUrl: row.attachmentUrl || undefined,
    notes: row.notes || undefined,
    approvalStatus: row.approvalStatus as Expense["approvalStatus"],
    erpSyncTarget: row.erpSyncTarget as Expense["erpSyncTarget"],
    erpSyncStatus: row.erpSyncStatus as Expense["erpSyncStatus"],
    erpSyncError: row.erpSyncError || undefined,
    erpSyncAttemptedAt: row.erpSyncAttemptedAt?.toISOString(),
    erpSyncedAt: row.erpSyncedAt?.toISOString(),
    erpReference: row.erpReference || undefined,
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdByRoleSnapshot: row.createdByRoleSnapshot,
    createdAt: row.createdAt.toISOString()
  };
}

export async function saveExpenseRecord(expense: Expense): Promise<Expense> {
  const row = await prisma.expenseRecord.create({
    data: {
      id: expense.id,
      expenseDate: new Date(expense.expenseDate),
      tipeId: expense.tipeId || "W",
      tipeCodeSnapshot: expense.tipeCodeSnapshot || "W",
      tipeNameSnapshot: expense.tipeNameSnapshot || "W",
      rekeningId: expense.rekeningId || "",
      rekeningNameSnapshot: expense.rekeningNameSnapshot || "",
      coaId: expense.coaId || "Kas",
      coaNameSnapshot: expense.coaNameSnapshot || "Kas",
      category: expense.category,
      vendorName: expense.vendorName,
      description: expense.description,
      amount: expense.amount,
      paymentMethod: expense.paymentMethod,
      attachmentUrl: expense.attachmentUrl,
      notes: expense.notes,
      approvalStatus: expense.approvalStatus || "approved",
      erpSyncTarget: expense.erpSyncTarget || "local",
      erpSyncStatus: expense.erpSyncStatus || "not_required",
      erpSyncError: expense.erpSyncError,
      erpSyncAttemptedAt: expense.erpSyncAttemptedAt ? new Date(expense.erpSyncAttemptedAt) : undefined,
      erpSyncedAt: expense.erpSyncedAt ? new Date(expense.erpSyncedAt) : undefined,
      erpReference: expense.erpReference,
      createdByUserId: expense.createdByUserId || "system",
      createdByNameSnapshot: expense.createdByNameSnapshot || "System",
      createdByRoleSnapshot: (expense.createdByRoleSnapshot || "OWNER") as Role,
      createdAt: expense.createdAt ? new Date(expense.createdAt) : new Date()
    }
  });
  return toExpense(row);
}

export async function getExpenseRecord(id: string): Promise<Expense | undefined> {
  const row = await prisma.expenseRecord.findUnique({ where: { id } });
  return row ? toExpense(row) : undefined;
}

export async function listExpenseRecords(): Promise<Expense[]> {
  const rows = await prisma.expenseRecord.findMany({ orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }] });
  return rows.map(toExpense);
}

export async function updateExpenseApprovalStatus(id: string, status: NonNullable<Expense["approvalStatus"]>): Promise<Expense | undefined> {
  const data: Prisma.ExpenseRecordUpdateInput = { approvalStatus: status };
  if (status === "rejected") {
    data.erpSyncStatus = "not_required";
    data.erpSyncError = "Pengeluaran ditolak approval.";
  }
  const row = await prisma.expenseRecord.update({ where: { id }, data }).catch(() => null);
  return row ? toExpense(row) : undefined;
}
