import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const models = {
  auditLogs: "auditLog",
  approvalRequests: "approvalRequest",
  tempoReceivables: "tempoReceivable",
  tempoPayments: "tempoPayment",
  salesRecords: "salesRecord"
};

function emptySummary(total = 0) {
  return { total, imported: 0, skipped: 0, failed: 0 };
}

async function assertReady() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diisi sebelum menjalankan migrasi JSON.");
  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.auditLog.count();
  } catch (error) {
    throw new Error(`Database belum siap atau schema Prisma belum diterapkan. Jalankan npm run db:migrate:deploy terlebih dulu. Detail: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readJsonArray(fileName) {
  try {
    const raw = await readFile(path.join(dataDir, fileName), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const toDate = (value) => value ? new Date(value) : undefined;
const toRole = (value) => ["OWNER", "SUPERVISOR", "ADMIN", "FINANCE", "MANAGER", "VIEWER"].includes(value) ? value : "VIEWER";

async function migrateAuditLogs() {
  const rows = await readJsonArray("audit-trail.json");
  const summary = emptySummary(rows.length);
  for (const row of rows) {
    if (!row?.id || !row?.entityType || !row?.createdAt) { summary.skipped++; continue; }
    try {
      const existing = await prisma.auditLog.findUnique({ where: { id: String(row.id) }, select: { id: true } });
      if (existing) { summary.skipped++; continue; }
      await prisma.auditLog.create({
        data: {
          id: String(row.id),
          entityType: String(row.entityType),
          entityId: String(row.entityId || "-"),
          action: String(row.action || "create"),
          beforeValue: row.beforeValue ?? undefined,
          afterValue: row.afterValue ?? undefined,
          userId: String(row.userId || "legacy"),
          userNameSnapshot: String(row.userNameSnapshot || "Legacy"),
          userRoleSnapshot: toRole(row.userRoleSnapshot),
          ipAddress: row.ipAddress ? String(row.ipAddress) : undefined,
          userAgent: row.userAgent ? String(row.userAgent) : undefined,
          reason: row.reason ? String(row.reason) : undefined,
          createdAt: new Date(row.createdAt)
        }
      });
      summary.imported++;
    } catch (error) {
      summary.failed++;
      console.error(`auditLogs:${row.id || "unknown"} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return summary;
}

async function migrateApprovalRequests() {
  const rows = await readJsonArray("approval-requests.json");
  const summary = emptySummary(rows.length);
  for (const row of rows) {
    if (!row?.id) { summary.skipped++; continue; }
    try {
      const existing = await prisma.approvalRequest.findUnique({ where: { id: String(row.id) }, select: { id: true } });
      if (existing) { summary.skipped++; continue; }
      await prisma.approvalRequest.create({
        data: {
          id: String(row.id),
          module: String(row.module || "unknown"),
          entityId: String(row.entityId || "-"),
          tipeCodeSnapshot: row.tipeCodeSnapshot ? String(row.tipeCodeSnapshot) : undefined,
          tipeNameSnapshot: row.tipeNameSnapshot ? String(row.tipeNameSnapshot) : undefined,
          amount: row.amount ?? undefined,
          status: row.status || "pending_approval",
          createdByUserId: String(row.createdByUserId || "legacy"),
          createdByNameSnapshot: String(row.createdByNameSnapshot || "Legacy"),
          createdByRoleSnapshot: toRole(row.createdByRoleSnapshot),
          createdAt: toDate(row.createdAt) || new Date(),
          approvedByUserId: row.approvedByUserId ? String(row.approvedByUserId) : undefined,
          approvedByNameSnapshot: row.approvedByNameSnapshot ? String(row.approvedByNameSnapshot) : undefined,
          approvedAt: toDate(row.approvedAt),
          rejectedByUserId: row.rejectedByUserId ? String(row.rejectedByUserId) : undefined,
          rejectedByNameSnapshot: row.rejectedByNameSnapshot ? String(row.rejectedByNameSnapshot) : undefined,
          rejectedAt: toDate(row.rejectedAt),
          rejectionReason: row.rejectionReason ? String(row.rejectionReason) : undefined
        }
      });
      summary.imported++;
    } catch (error) {
      summary.failed++;
      console.error(`approvalRequests:${row.id || "unknown"} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return summary;
}

async function migrateTempoReceivables() {
  const rows = await readJsonArray("tempo-receivables.json");
  const summary = emptySummary(rows.length);
  for (const row of rows) {
    if (!row?.id) { summary.skipped++; continue; }
    try {
      const existing = await prisma.tempoReceivable.findUnique({ where: { id: String(row.id) }, select: { id: true } });
      if (existing) { summary.skipped++; continue; }
      await prisma.tempoReceivable.create({
        data: {
          id: String(row.id),
          salesId: String(row.salesId || "-"),
          tipeId: String(row.tipeId || "W"),
          tipeCodeSnapshot: String(row.tipeCodeSnapshot || "W"),
          tipeNameSnapshot: String(row.tipeNameSnapshot || "W"),
          customerName: String(row.customerName || "-"),
          originalAmount: row.originalAmount || 0,
          paidAmount: row.paidAmount || 0,
          remainingAmount: row.remainingAmount ?? row.originalAmount ?? 0,
          transactionDate: toDate(row.transactionDate) || new Date(),
          dueDate: toDate(row.dueDate) || new Date(),
          status: row.status || "open",
          createdByUserId: String(row.createdByUserId || "legacy"),
          createdByNameSnapshot: String(row.createdByNameSnapshot || "Legacy"),
          createdAt: toDate(row.createdAt) || new Date(),
          updatedAt: toDate(row.updatedAt) || new Date()
        }
      });
      summary.imported++;
    } catch (error) {
      summary.failed++;
      console.error(`tempoReceivables:${row.id || "unknown"} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return summary;
}

async function migrateTempoPayments() {
  const rows = await readJsonArray("tempo-payments.json");
  const summary = emptySummary(rows.length);
  for (const row of rows) {
    if (!row?.id || !row?.tempoReceivableId) { summary.skipped++; continue; }
    try {
      const existing = await prisma.tempoPayment.findUnique({ where: { id: String(row.id) }, select: { id: true } });
      if (existing) { summary.skipped++; continue; }
      await prisma.tempoPayment.create({
        data: {
          id: String(row.id),
          tempoReceivableId: String(row.tempoReceivableId),
          paymentDate: toDate(row.paymentDate) || new Date(),
          amountPaid: row.amountPaid || 0,
          paymentMethod: String(row.paymentMethod || "Cash"),
          rekeningId: String(row.rekeningId || ""),
          rekeningNameSnapshot: String(row.rekeningNameSnapshot || row.rekeningId || ""),
          attachmentUrl: row.attachmentUrl ? String(row.attachmentUrl) : undefined,
          notes: row.notes ? String(row.notes) : undefined,
          createdByUserId: String(row.createdByUserId || "legacy"),
          createdByNameSnapshot: String(row.createdByNameSnapshot || "Legacy"),
          createdAt: toDate(row.createdAt) || new Date()
        }
      });
      summary.imported++;
    } catch (error) {
      summary.failed++;
      console.error(`tempoPayments:${row.id || "unknown"} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return summary;
}

async function migrateSalesRecords() {
  const rows = await readJsonArray("sales-records.json");
  const summary = emptySummary(rows.length);
  for (const row of rows) {
    if (!row?.id) { summary.skipped++; continue; }
    try {
      const existing = await prisma.salesRecord.findUnique({ where: { id: String(row.id) }, select: { id: true } });
      if (existing) { summary.skipped++; continue; }
      const items = Array.isArray(row.items) ? row.items : [];
      await prisma.salesRecord.create({
        data: {
          id: String(row.id),
          saleDate: toDate(row.saleDate) || new Date(),
          tipeId: String(row.tipeId || "W"),
          tipeCodeSnapshot: String(row.tipeCodeSnapshot || "W"),
          tipeNameSnapshot: String(row.tipeNameSnapshot || "W"),
          customerName: String(row.customerName || "Walk In"),
          customerLocation: row.customerLocation ? String(row.customerLocation) : undefined,
          shippingMethod: row.shippingMethod ? String(row.shippingMethod) : undefined,
          paymentMethod: String(row.paymentMethod || "Cash"),
          dueDate: toDate(row.dueDate),
          rekeningId: row.rekeningId ? String(row.rekeningId) : undefined,
          transferAccount: row.transferAccount ? String(row.transferAccount) : undefined,
          notes: row.notes ? String(row.notes) : undefined,
          total: row.total || 0,
          approvalStatus: String(row.approvalStatus || "approved"),
          createdByUserId: String(row.createdByUserId || "legacy"),
          createdByNameSnapshot: String(row.createdByNameSnapshot || "Legacy"),
          createdByRoleSnapshot: toRole(row.createdByRoleSnapshot),
          createdAt: toDate(row.createdAt) || new Date(),
          items: {
            create: items.map((item, index) => ({
              id: `${row.id}-item-${index}`,
              productRef: String(item?.productRef || ""),
              quantity: item?.quantity || 0,
              unitPrice: item?.unitPrice || 0,
              discount: item?.discount || 0,
              sortOrder: index
            }))
          }
        }
      });
      summary.imported++;
    } catch (error) {
      summary.failed++;
      console.error(`salesRecords:${row.id || "unknown"} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return summary;
}

async function main() {
  await assertReady();
  const result = {
    auditLogs: await migrateAuditLogs(),
    salesRecords: await migrateSalesRecords(),
    approvalRequests: await migrateApprovalRequests(),
    tempoReceivables: await migrateTempoReceivables(),
    tempoPayments: await migrateTempoPayments()
  };
  const failed = Object.values(result).reduce((sum, item) => sum + item.failed, 0);
  const counts = {};
  for (const [key, model] of Object.entries(models)) counts[key] = await prisma[model].count();
  result.databaseCounts = counts;
  console.log(JSON.stringify(result, null, 2));
  if (failed > 0) throw new Error(`Migrasi JSON selesai dengan ${failed} record gagal.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
