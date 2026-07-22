import "server-only";
import type { Role } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { buildFinanceReportSummary, buildPaidSalesReport } from "@/lib/reports/summary";
import type { Expense } from "@/lib/types/expenses";
import type { Sale } from "@/lib/types/sales";
import type { TempoPayment, TempoPaymentReversal, TempoReceivable, TempoStatus } from "@/lib/tempo/store";
import { jakartaDateKey } from "@/lib/date/jakarta";

function dateStart(value: string) {
  return new Date(`${value}T00:00:00.000`);
}

function dateEnd(value: string) {
  return new Date(`${value}T23:59:59.999`);
}

function monthStart(value: string) {
  return new Date(`${value}-01T00:00:00.000`);
}

function nextMonthStart(value: string) {
  const [year, month] = value.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000`);
}

function dateKey(value: Date) {
  return jakartaDateKey(value);
}

function toReportSale(row: Awaited<ReturnType<typeof prisma.salesRecord.findMany>>[number]): Sale {
  return {
    id: row.id,
    saleDate: dateKey(row.saleDate),
    tipeId: row.tipeId,
    tipeCodeSnapshot: row.tipeCodeSnapshot,
    tipeNameSnapshot: row.tipeNameSnapshot,
    customerName: row.customerName,
    customerLocation: row.customerLocation || undefined,
    paymentMethod: row.paymentMethod as Sale["paymentMethod"],
    initialPaymentAmount: Number(row.initialPaymentAmount || 0),
    initialPaymentMethod: row.initialPaymentMethod as Sale["initialPaymentMethod"] || undefined,
    initialPaymentRekeningId: row.initialPaymentRekeningId || undefined,
    initialPaymentRekeningNameSnapshot: row.initialPaymentRekeningNameSnapshot || undefined,
    initialPaymentNotes: row.initialPaymentNotes || undefined,
    total: Number(row.total),
    approvalStatus: row.approvalStatus as Sale["approvalStatus"],
    syncTarget: row.syncTarget as Sale["syncTarget"],
    syncStatus: row.syncStatus as Sale["syncStatus"],
    erpReference: row.erpReference || undefined,
    isTestTransaction: row.isTestTransaction,
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdByRoleSnapshot: row.createdByRoleSnapshot as Role,
    createdAt: row.createdAt.toISOString(),
    items: []
  };
}

function toReportExpense(row: Awaited<ReturnType<typeof prisma.expenseRecord.findMany>>[number]): Expense {
  return {
    id: row.id,
    expenseDate: dateKey(row.expenseDate),
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
    erpReference: row.erpReference || undefined,
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdByRoleSnapshot: row.createdByRoleSnapshot as Role,
    createdAt: row.createdAt.toISOString()
  };
}

function toReportTempo(row: Awaited<ReturnType<typeof prisma.tempoReceivable.findMany>>[number]): TempoReceivable {
  return {
    id: row.id,
    salesId: row.salesId,
    tipeId: row.tipeId,
    tipeCodeSnapshot: row.tipeCodeSnapshot,
    tipeNameSnapshot: row.tipeNameSnapshot,
    customerName: row.customerName,
    originalAmount: Number(row.originalAmount),
    paidAmount: Number(row.paidAmount),
    remainingAmount: Number(row.remainingAmount),
    transactionDate: dateKey(row.transactionDate),
    dueDate: dateKey(row.dueDate),
    status: row.status as TempoStatus,
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toReportTempoPayment(row: Awaited<ReturnType<typeof prisma.tempoPayment.findMany>>[number]): TempoPayment {
  return {
    id: row.id,
    tempoReceivableId: row.tempoReceivableId,
    paymentDate: dateKey(row.paymentDate),
    amountPaid: Number(row.amountPaid),
    paymentMethod: row.paymentMethod as TempoPayment["paymentMethod"],
    rekeningId: row.rekeningId,
    rekeningNameSnapshot: row.rekeningNameSnapshot,
    attachmentUrl: row.attachmentUrl || undefined,
    notes: row.notes || undefined,
    erpPaymentStatus: row.erpPaymentStatus as TempoPayment["erpPaymentStatus"],
    erpPaymentError: row.erpPaymentError || undefined,
    erpPaymentReference: row.erpPaymentReference || undefined,
    erpPaymentSyncedAt: row.erpPaymentSyncedAt?.toISOString(),
    erpPaymentAttemptedAt: row.erpPaymentAttemptedAt?.toISOString(),
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdAt: row.createdAt.toISOString()
  };
}

function toReportTempoReversal(row: Awaited<ReturnType<typeof prisma.tempoPaymentReversal.findMany>>[number]): TempoPaymentReversal {
  return { id: row.id, tempoPaymentId: row.tempoPaymentId, reversalDate: dateKey(row.reversalDate), amount: Number(row.amount), reason: row.reason, erpStatus: row.erpStatus, erpReference: row.erpReference || undefined, createdByUserId: row.createdByUserId, createdByNameSnapshot: row.createdByNameSnapshot, createdAt: row.createdAt.toISOString() };
}

export async function getPaidSalesReport(reportDate: string) {
  const [rows, tempoPaymentRows, reversalRows] = await Promise.all([prisma.salesRecord.findMany({
    where: {
      saleDate: { gte: dateStart(reportDate), lte: dateEnd(reportDate) },
      approvalStatus: "approved",
      paymentMethod: { in: ["Cash", "TF"] }
    },
    orderBy: { createdAt: "desc" }
  }), prisma.tempoPayment.findMany({ include: { tempoReceivable: true }, orderBy: { createdAt: "desc" } }), prisma.tempoPaymentReversal.findMany({ where: { reversalDate: { gte: dateStart(reportDate), lte: dateEnd(reportDate) } }, orderBy: { createdAt: "desc" } })]);
  const tempoPayments = tempoPaymentRows.map((row) => ({ ...toReportTempoPayment(row), customerName: row.tempoReceivable.customerName, salesId: row.tempoReceivable.salesId, tipeCodeSnapshot: row.tempoReceivable.tipeCodeSnapshot }));
  return buildPaidSalesReport(rows.map(toReportSale), reportDate, tempoPayments, reversalRows.map(toReportTempoReversal));
}

export async function getFinanceReport(month: string) {
  const [tempo, payments, reversals, expenses] = await Promise.all([
    prisma.tempoReceivable.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.tempoPayment.findMany({
      where: { paymentDate: { gte: monthStart(month), lt: nextMonthStart(month) } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.tempoPaymentReversal.findMany({ where: { reversalDate: { gte: monthStart(month), lt: nextMonthStart(month) } }, orderBy: { createdAt: "desc" } }),
    prisma.expenseRecord.findMany({
      where: {
        expenseDate: { gte: monthStart(month), lt: nextMonthStart(month) },
        approvalStatus: "approved"
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }]
    })
  ]);

  return buildFinanceReportSummary({
    month,
    tempo: tempo.map(toReportTempo),
    payments: payments.map(toReportTempoPayment),
    reversals: reversals.map(toReportTempoReversal),
    expenses: expenses.map(toReportExpense)
  });
}
