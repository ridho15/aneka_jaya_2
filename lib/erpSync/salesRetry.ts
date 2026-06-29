import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/store";
import { sendNeoCommand } from "@/lib/api/neo";
import { buildSalesNeoCommand, erpReferenceFrom, safeErpSyncError } from "@/lib/api/sales";

const salesInclude = { items: { orderBy: { sortOrder: "asc" as const } } };

type SalesRow = Prisma.SalesRecordGetPayload<{ include: typeof salesInclude }>;

export type ErpSyncSaleItem = {
  id: string;
  saleDate: string;
  tipeCode: string;
  customerName: string;
  paymentMethod: string;
  total: number;
  syncStatus: string;
  syncError?: string;
  syncAttemptedAt?: string;
  syncedAt?: string;
  erpReference?: string;
  retryable: boolean;
};

export type ErpSyncOverview = {
  summary: { pending: number; failed: number; synced: number; totalErp: number };
  items: ErpSyncSaleItem[];
};

function toSyncItem(row: SalesRow): ErpSyncSaleItem {
  return {
    id: row.id,
    saleDate: row.saleDate.toISOString().slice(0, 10),
    tipeCode: row.tipeCodeSnapshot,
    customerName: row.customerName,
    paymentMethod: row.paymentMethod,
    total: Number(row.total),
    syncStatus: row.syncStatus,
    syncError: row.syncError || undefined,
    syncAttemptedAt: row.syncAttemptedAt?.toISOString(),
    syncedAt: row.syncedAt?.toISOString(),
    erpReference: row.erpReference || undefined,
    retryable: ["pending", "failed"].includes(row.syncStatus)
  };
}

function buildRetryCommand(row: SalesRow) {
  return buildSalesNeoCommand({
    saleDate: row.saleDate.toISOString().slice(0, 10),
    tipeId: row.tipeId,
    tipeCodeSnapshot: row.tipeCodeSnapshot,
    tipeNameSnapshot: row.tipeNameSnapshot,
    customerName: row.customerName,
    customerLocation: row.customerLocation || undefined,
    paymentMethod: row.paymentMethod,
    dueDate: row.dueDate?.toISOString().slice(0, 10),
    rekeningId: row.rekeningId || undefined,
    shippingMethod: row.shippingMethod || undefined,
    transferAccount: row.transferAccount || undefined,
    notes: row.notes || undefined,
    items: row.items.map((item) => ({ productRef: item.productRef, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), discount: Number(item.discount) })),
    testReference: row.testReference || undefined,
    isTestTransaction: row.isTestTransaction
  });
}

export async function getErpSyncOverview(): Promise<ErpSyncOverview> {
  const [pending, failed, synced, items] = await Promise.all([
    prisma.salesRecord.count({ where: { syncTarget: "erp", syncStatus: "pending" } }),
    prisma.salesRecord.count({ where: { syncTarget: "erp", syncStatus: "failed" } }),
    prisma.salesRecord.count({ where: { syncTarget: "erp", syncStatus: "synced" } }),
    prisma.salesRecord.findMany({
      where: { syncTarget: "erp", syncStatus: { in: ["pending", "failed"] } },
      include: salesInclude,
      orderBy: [{ syncAttemptedAt: "asc" }, { createdAt: "asc" }],
      take: 100
    })
  ]);
  return { summary: { pending, failed, synced, totalErp: pending + failed + synced }, items: items.map(toSyncItem) };
}

export async function retrySalesErpSync(id: string): Promise<{ success: boolean; item?: ErpSyncSaleItem; message: string }> {
  const row = await prisma.salesRecord.findUnique({ where: { id }, include: salesInclude });
  if (!row || row.syncTarget !== "erp") return { success: false, message: "Transaksi ERP tidak ditemukan." };
  if (row.syncStatus === "synced") return { success: true, item: toSyncItem(row), message: "Transaksi sudah tersinkron." };

  const attemptedAt = new Date();
  await prisma.salesRecord.update({ where: { id }, data: { syncStatus: "pending", syncAttemptedAt: attemptedAt } });
  const response = await sendNeoCommand(buildRetryCommand(row));

  if (response.success) {
    const syncedAt = new Date();
    const erpReference = erpReferenceFrom(response.data);
    const updated = await prisma.salesRecord.update({
      where: { id },
      data: { syncStatus: "synced", syncError: null, syncAttemptedAt: attemptedAt, syncedAt, erpReference },
      include: salesInclude
    });
    await recordAudit({ entityType: "erp_sync", entityId: id, action: "retry_sync", afterValue: { syncStatus: "synced", erpReference }, reason: "Retry ERP sales berhasil" });
    return { success: true, item: toSyncItem(updated), message: "Retry ERP berhasil." };
  }

  const syncError = safeErpSyncError(response);
  const updated = await prisma.salesRecord.update({
    where: { id },
    data: { syncStatus: "failed", syncError, syncAttemptedAt: attemptedAt },
    include: salesInclude
  });
  await recordAudit({ entityType: "erp_sync", entityId: id, action: "retry_sync", afterValue: { syncStatus: "failed", syncError }, reason: `Retry ERP sales gagal • ${syncError}` });
  return { success: false, item: toSyncItem(updated), message: syncError || "Retry ERP gagal." };
}

export async function retryPendingSalesErpSync(limit = 25) {
  const rows = await prisma.salesRecord.findMany({
    where: { syncTarget: "erp", syncStatus: { in: ["pending", "failed"] } },
    select: { id: true },
    orderBy: [{ syncAttemptedAt: "asc" }, { createdAt: "asc" }],
    take: limit
  });
  const results = [];
  for (const row of rows) results.push({ id: row.id, ...(await retrySalesErpSync(row.id)) });
  return {
    attempted: results.length,
    succeeded: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results
  };
}
