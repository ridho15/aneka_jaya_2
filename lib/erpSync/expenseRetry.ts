import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/store";
import { sendNeoCommand } from "@/lib/api/neo";
import { buildExpenseNeoCommand } from "@/lib/api/expenses";
import { erpReferenceFrom, safeErpSyncError } from "@/lib/api/sales";

type ExpenseRow = Prisma.ExpenseRecordGetPayload<object>;

export type ErpSyncExpenseItem = {
  id: string;
  expenseDate: string;
  tipeCode: string;
  rekeningName: string;
  coaName: string;
  category: string;
  vendorName: string;
  amount: number;
  erpSyncStatus: string;
  erpSyncError?: string;
  erpSyncAttemptedAt?: string;
  erpSyncedAt?: string;
  erpReference?: string;
  retryable: boolean;
};

export type ExpenseSyncOverview = {
  summary: { pending: number; failed: number; synced: number; totalErp: number };
  items: ErpSyncExpenseItem[];
  storageReady: boolean;
  warning?: string;
};

const PRISMA_SYNC_WARNING = "Prisma Client belum tersinkron. Jalankan generate/migrate dan restart server.";

function correlationIdFromFailure(response: { success: false; details?: unknown }) {
  const details = response.details && typeof response.details === "object" ? response.details as Record<string, unknown> : {};
  return typeof details.correlationId === "string" ? details.correlationId : undefined;
}

function expenseDelegate() {
  return (prisma as typeof prisma & { expenseRecord?: typeof prisma.expenseRecord }).expenseRecord;
}

function toSyncItem(row: ExpenseRow): ErpSyncExpenseItem {
  return {
    id: row.id,
    expenseDate: row.expenseDate.toISOString().slice(0, 10),
    tipeCode: row.tipeCodeSnapshot,
    rekeningName: row.rekeningNameSnapshot,
    coaName: row.coaNameSnapshot,
    category: row.category,
    vendorName: row.vendorName,
    amount: Number(row.amount),
    erpSyncStatus: row.erpSyncStatus,
    erpSyncError: row.erpSyncError || undefined,
    erpSyncAttemptedAt: row.erpSyncAttemptedAt?.toISOString(),
    erpSyncedAt: row.erpSyncedAt?.toISOString(),
    erpReference: row.erpReference || undefined,
    retryable: row.approvalStatus === "approved" && ["pending", "failed"].includes(row.erpSyncStatus)
  };
}

function buildRetryCommand(row: ExpenseRow) {
  return buildExpenseNeoCommand({
    expenseDate: row.expenseDate.toISOString().slice(0, 10),
    tipeCodeSnapshot: row.tipeCodeSnapshot,
    rekeningNameSnapshot: row.rekeningNameSnapshot,
    coaNameSnapshot: row.coaNameSnapshot,
    category: row.category,
    vendorName: row.vendorName,
    description: row.description,
    amount: Number(row.amount),
    paymentMethod: row.paymentMethod,
    attachmentUrl: row.attachmentUrl || undefined,
    notes: row.notes || undefined
  });
}

export async function getExpenseSyncOverview(): Promise<ExpenseSyncOverview> {
  const delegate = expenseDelegate();
  if (!delegate) return { summary: { pending: 0, failed: 0, synced: 0, totalErp: 0 }, items: [], storageReady: false, warning: PRISMA_SYNC_WARNING };
  const [pending, failed, synced, items] = await Promise.all([
    delegate.count({ where: { erpSyncTarget: "erp", approvalStatus: "approved", erpSyncStatus: "pending" } }),
    delegate.count({ where: { erpSyncTarget: "erp", approvalStatus: "approved", erpSyncStatus: "failed" } }),
    delegate.count({ where: { erpSyncTarget: "erp", approvalStatus: "approved", erpSyncStatus: "synced" } }),
    delegate.findMany({
      where: { erpSyncTarget: "erp", approvalStatus: "approved", erpSyncStatus: { in: ["pending", "failed"] } },
      orderBy: [{ erpSyncAttemptedAt: "asc" }, { createdAt: "asc" }],
      take: 100
    })
  ]);
  return { summary: { pending, failed, synced, totalErp: pending + failed + synced }, items: items.map(toSyncItem), storageReady: true };
}

export async function retryExpenseErpSync(id: string): Promise<{ success: boolean; item?: ErpSyncExpenseItem; message: string }> {
  const delegate = expenseDelegate();
  if (!delegate) return { success: false, message: PRISMA_SYNC_WARNING };
  const row = await delegate.findUnique({ where: { id } });
  if (!row || row.erpSyncTarget !== "erp") return { success: false, message: "Pengeluaran ERP tidak ditemukan." };
  if (row.approvalStatus !== "approved") return { success: false, item: toSyncItem(row), message: "Pengeluaran belum approved, tidak bisa sinkron ERP." };
  if (row.erpSyncStatus === "synced") return { success: true, item: toSyncItem(row), message: "Pengeluaran sudah tersinkron." };

  const attemptedAt = new Date();
  await delegate.update({ where: { id }, data: { erpSyncStatus: "pending", erpSyncAttemptedAt: attemptedAt } });
  const response = await sendNeoCommand(buildRetryCommand(row));

  if (response.success) {
    const syncedAt = new Date();
    const erpReference = erpReferenceFrom(response.data);
    const updated = await delegate.update({
      where: { id },
      data: { erpSyncStatus: "synced", erpSyncError: null, erpSyncAttemptedAt: attemptedAt, erpSyncedAt: syncedAt, erpReference }
    });
    await recordAudit({ entityType: "erp_sync", entityId: id, action: "retry_sync", afterValue: { erpSyncStatus: "synced", erpReference }, reason: "Retry ERP expense berhasil" });
    return { success: true, item: toSyncItem(updated), message: "Retry pengeluaran ERP berhasil." };
  }

  const erpSyncError = safeErpSyncError(response);
  const updated = await delegate.update({
    where: { id },
    data: { erpSyncStatus: "failed", erpSyncError, erpSyncAttemptedAt: attemptedAt }
  });
  await recordAudit({ entityType: "erp_sync", entityId: id, action: "retry_sync", afterValue: { erpSyncStatus: "failed", erpSyncError, correlationId: correlationIdFromFailure(response) }, reason: `Retry ERP expense gagal • ${erpSyncError}` });
  return { success: false, item: toSyncItem(updated), message: erpSyncError || "Retry pengeluaran ERP gagal." };
}

export async function retryPendingExpenseErpSync(limit = 25) {
  const delegate = expenseDelegate();
  if (!delegate) return { attempted: 0, succeeded: 0, failed: 1, results: [{ id: "expense-storage", success: false, message: PRISMA_SYNC_WARNING }] };
  const rows = await delegate.findMany({
    where: { erpSyncTarget: "erp", approvalStatus: "approved", erpSyncStatus: { in: ["pending", "failed"] } },
    select: { id: true },
    orderBy: [{ erpSyncAttemptedAt: "asc" }, { createdAt: "asc" }],
    take: limit
  });
  const results = [];
  for (const row of rows) results.push({ id: row.id, ...(await retryExpenseErpSync(row.id)) });
  return {
    attempted: results.length,
    succeeded: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results
  };
}
