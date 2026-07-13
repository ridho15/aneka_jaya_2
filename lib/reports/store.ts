import "server-only";
import type { Role } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { buildFinanceReportSummary, buildPaidSalesReport } from "@/lib/reports/summary";
import type { Expense } from "@/lib/types/expenses";
import type { Sale } from "@/lib/types/sales";
import type { TempoPayment, TempoReceivable, TempoStatus } from "@/lib/tempo/store";

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
  return value.toISOString().slice(0, 10);
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

export async function getPaidSalesReport(reportDate: string) {
  const rows = await prisma.salesRecord.findMany({
    where: {
      saleDate: { gte: dateStart(reportDate), lte: dateEnd(reportDate) },
      approvalStatus: "approved",
      paymentMethod: { in: ["Cash", "TF"] }
    },
    orderBy: { createdAt: "desc" }
  });
  return buildPaidSalesReport(rows.map(toReportSale), reportDate);
}

export async function getFinanceReport(month: string) {
  const [tempo, payments, expenses] = await Promise.all([
    prisma.tempoReceivable.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.tempoPayment.findMany({
      where: { paymentDate: { gte: monthStart(month), lt: nextMonthStart(month) } },
      orderBy: { createdAt: "desc" }
    }),
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
    expenses: expenses.map(toReportExpense)
  });
}
