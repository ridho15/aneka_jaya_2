import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/audit/store";
import { readJsonArray, writeJsonArray } from "@/lib/data/jsonStore";
import { allocateTransactionIdentity, getSalesRecord, updateSalesApprovalStatus } from "@/lib/sales/store";
import { updateExpenseApprovalStatus } from "@/lib/expenses/store";
import { createDeliveryOrderForSale } from "@/lib/deliveryOrders/store";
import { transactionDateKey } from "@/lib/date/jakarta";
import { createTempoReceivable, createTempoReceivableInTransaction } from "@/lib/tempo/store";
import { prisma } from "@/lib/db/prisma";
import { ApprovalStatus as PrismaApprovalStatus, type Prisma } from "@prisma/client";
import { type ApprovalAction, isApprovalAction, validateApprovalTransition } from "./validation";
import { postExpenseJournal, reverseExpenseJournal } from "@/lib/accounting/postingHooks";

export type ApprovalStatus = "draft" | "pending_approval" | "approved" | "rejected" | "cancelled";
export type ApprovalModule = "penjualan" | "pengeluaran" | "pembelian" | "stock" | "rekening_reset";

export class ApprovalForbiddenError extends Error {
  constructor(message = "Tidak punya akses approval.") {
    super(message);
    this.name = "ApprovalForbiddenError";
  }
}

export type ApprovalRequest = {
  id: string;
  module: ApprovalModule;
  entityId: string;
  tipeCodeSnapshot?: string;
  tipeNameSnapshot?: string;
  amount?: number;
  status: ApprovalStatus;
  createdByUserId: string;
  createdByNameSnapshot: string;
  createdByRoleSnapshot: string;
  createdAt: string;
  approvedByUserId?: string;
  approvedByNameSnapshot?: string;
  approvedAt?: string;
  rejectedByUserId?: string;
  rejectedByNameSnapshot?: string;
  rejectedAt?: string;
  rejectionReason?: string;
};

export { isApprovalAction };
const fileName = "approval-requests.json";
const isProductionMode = () => process.env.NEXT_PUBLIC_APP_MODE === "production";
const DEFAULT_APPROVAL_PAGE_SIZE = 10;
const MAX_APPROVAL_PAGE_SIZE = 50;

export type ApprovalListFilter = {
  status?: ApprovalStatus | "active" | "history";
};

export type PaginatedApprovalRequests = {
  data: ApprovalRequest[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

function cleanPage(value?: number) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 1;
}

function cleanPageSize(value?: number) {
  if (!Number.isFinite(value) || !value || value <= 0) return DEFAULT_APPROVAL_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(value), 1), MAX_APPROVAL_PAGE_SIZE);
}

function statusWhere(status?: ApprovalListFilter["status"]): Prisma.ApprovalRequestWhereInput {
  if (status === "active") return { status: PrismaApprovalStatus.pending_approval };
  if (status === "history") return { NOT: { status: PrismaApprovalStatus.pending_approval } };
  return status ? { status: status as PrismaApprovalStatus } : {};
}

function serializeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function toApprovalRequest(row: Awaited<ReturnType<typeof prisma.approvalRequest.findMany>>[number]): ApprovalRequest {
  return {
    id: row.id,
    module: row.module as ApprovalModule,
    entityId: row.entityId,
    tipeCodeSnapshot: row.tipeCodeSnapshot || undefined,
    tipeNameSnapshot: row.tipeNameSnapshot || undefined,
    amount: row.amount === null ? undefined : Number(row.amount),
    status: row.status as ApprovalStatus,
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdByRoleSnapshot: row.createdByRoleSnapshot,
    createdAt: row.createdAt.toISOString(),
    approvedByUserId: row.approvedByUserId || undefined,
    approvedByNameSnapshot: row.approvedByNameSnapshot || undefined,
    approvedAt: row.approvedAt?.toISOString(),
    rejectedByUserId: row.rejectedByUserId || undefined,
    rejectedByNameSnapshot: row.rejectedByNameSnapshot || undefined,
    rejectedAt: row.rejectedAt?.toISOString(),
    rejectionReason: row.rejectionReason || undefined
  };
}

export function approvalIsEnabled(module: ApprovalModule) {
  const key = `REQUIRE_APPROVAL_${module.toUpperCase()}`;
  return process.env[key] !== "false";
}

export async function createApprovalRequest(input: Omit<ApprovalRequest, "id" | "createdByUserId" | "createdByNameSnapshot" | "createdByRoleSnapshot" | "createdAt" | "status"> & { status?: ApprovalStatus }): Promise<ApprovalRequest> {
  const user = await getCurrentUser();
  const request: ApprovalRequest = {
    id: `APR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: input.status || (user.role === "ADMIN" && approvalIsEnabled(input.module) ? "pending_approval" : "approved"),
    createdByUserId: user.id,
    createdByNameSnapshot: user.name,
    createdByRoleSnapshot: user.role,
    createdAt: new Date().toISOString(),
    ...input
  };
  if (isProductionMode()) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.approvalRequest.create({
        data: {
          id: request.id,
          module: request.module,
          entityId: request.entityId,
          tipeCodeSnapshot: request.tipeCodeSnapshot,
          tipeNameSnapshot: request.tipeNameSnapshot,
          amount: request.amount,
          status: request.status,
          createdByUserId: user.id,
          createdByNameSnapshot: user.name,
          createdByRoleSnapshot: user.role,
          createdAt: new Date(request.createdAt)
        }
      });
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          entityType: "approval",
          entityId: request.id,
          action: "create",
          afterValue: serializeJson(request),
          userId: user.id,
          userNameSnapshot: user.name,
          userRoleSnapshot: user.role,
          reason: `${request.module} ${request.status}`
        }
      });
    });
    return request;
  }
  const rows = await readJsonArray<ApprovalRequest>(fileName);
  rows.unshift(request);
  await writeJsonArray(fileName, rows);
  await recordAudit({ entityType: "approval", entityId: request.id, action: "create", afterValue: request, reason: `${request.module} ${request.status}` });
  return request;
}

export async function listApprovalRequests(): Promise<ApprovalRequest[]> {
  if (isProductionMode()) {
    const rows = await prisma.approvalRequest.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toApprovalRequest);
  }
  return readJsonArray<ApprovalRequest>(fileName);
}

export async function listApprovalRequestsPage(input: { page?: number; pageSize?: number; filter?: ApprovalListFilter } = {}): Promise<PaginatedApprovalRequests> {
  const page = cleanPage(input.page);
  const pageSize = cleanPageSize(input.pageSize);
  if (isProductionMode()) {
    const where = statusWhere(input.filter?.status);
    const [total, rows] = await Promise.all([
      prisma.approvalRequest.count({ where }),
      prisma.approvalRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    return { data: rows.map(toApprovalRequest), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }
  const rows = await readJsonArray<ApprovalRequest>(fileName);
  const filtered = rows.filter((row) => {
    if (input.filter?.status === "active") return row.status === "pending_approval";
    if (input.filter?.status === "history") return row.status !== "pending_approval";
    return input.filter?.status ? row.status === input.filter.status : true;
  });
  const start = (page - 1) * pageSize;
  return { data: filtered.slice(start, start + pageSize), meta: { page, pageSize, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)) } };
}

export async function getApprovalRequest(id: string): Promise<ApprovalRequest | null> {
  if (isProductionMode()) {
    const row = await prisma.approvalRequest.findUnique({ where: { id } });
    return row ? toApprovalRequest(row) : null;
  }
  const rows = await readJsonArray<ApprovalRequest>(fileName);
  return rows.find((row) => row.id === id) || null;
}

export async function updateApprovalStatus(id: string, action: ApprovalAction, reason?: string): Promise<ApprovalRequest> {
  const user = await getCurrentUser();
  if (!can(user.role, "approval.approve")) throw new ApprovalForbiddenError();
  if (isProductionMode()) {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await tx.approvalRequest.findUnique({ where: { id } });
      if (!row) throw new Error("Approval tidak ditemukan.");
      const before = toApprovalRequest(row);
      const transitionError = validateApprovalTransition(before.status, action, reason);
      if (transitionError) throw new Error(transitionError);
      if (before.createdByUserId === user.id && user.role !== "OWNER") throw new Error("User tidak boleh approve data sendiri.");
      const now = new Date();
      const updated = action === "approve"
        ? await tx.approvalRequest.update({ where: { id }, data: { status: "approved", approvedByUserId: user.id, approvedByNameSnapshot: user.name, approvedAt: now } })
        : await tx.approvalRequest.update({ where: { id }, data: { status: "rejected", rejectedByUserId: user.id, rejectedByNameSnapshot: user.name, rejectedAt: now, rejectionReason: reason } });
      const after = toApprovalRequest(updated);
      if (after.module === "penjualan") {
        const salesStatus = after.status === "approved" ? "approved" : after.status === "rejected" ? "rejected" : after.status;
        if (after.status === "approved") {
          const nowIso = now.toISOString();
          const identity = await allocateTransactionIdentity(tx, nowIso);
          const existingSale = await tx.salesRecord.findUnique({ where: { id: after.entityId } });
          const deliveryAt = existingSale?.deliveryAt && existingSale.deliveryAt < now ? now : (existingSale?.deliveryAt || null);
          const sale = await tx.salesRecord.update({
            where: { id: after.entityId },
            data: {
              approvalStatus: salesStatus,
              transactionAt: now,
              saleDate: new Date(identity.transactionDateKey),
              transactionDateKey: identity.transactionDateKey,
              transactionSequence: identity.transactionSequence,
              transactionNumber: identity.transactionNumber,
              deliveryAt
            }
          }).catch(() => null);

          if (sale?.paymentMethod === "Tempo") {
            const dueDate = sale.dueDate && sale.dueDate < now ? now : (sale.dueDate || sale.saleDate);
            await createTempoReceivableInTransaction(tx, {
              salesId: sale.id, tipeId: sale.tipeId, tipeCodeSnapshot: sale.tipeCodeSnapshot, tipeNameSnapshot: sale.tipeNameSnapshot,
              customerName: sale.customerName, originalAmount: Number(sale.total),
              transactionDate: nowIso,
              dueDate: dueDate.toISOString(),
              initialPayment: { amount: Number(sale.initialPaymentAmount || 0), method: sale.initialPaymentMethod as "Cash" | "TF" | "Other" | undefined, rekeningId: sale.initialPaymentRekeningId || undefined, rekeningNameSnapshot: sale.initialPaymentRekeningNameSnapshot || undefined, notes: sale.initialPaymentNotes || undefined }
            }, user);
          }
          await createDeliveryOrderForSale(after.entityId, tx).catch((err) => {
            console.error("[DO] Failed to create delivery order on approval:", err);
          });
        } else {
          await tx.salesRecord.update({ where: { id: after.entityId }, data: { approvalStatus: salesStatus } }).catch(() => null);
        }
      }
      if (after.module === "pengeluaran") {
        const expenseStatus = after.status === "approved" ? "approved" : after.status === "rejected" ? "rejected" : after.status;
        await tx.expenseRecord.update({
          where: { id: after.entityId },
          data: after.status === "rejected"
            ? { approvalStatus: expenseStatus, erpSyncStatus: "not_required", erpSyncError: "Pengeluaran ditolak approval." }
            : { approvalStatus: expenseStatus, expenseDate: now }
        }).catch(() => null);

        if (after.status === "rejected" && typeof tx.employeeLoan?.updateMany === "function") {
          await tx.employeeLoan.updateMany({
            where: { expenseRecordId: after.entityId },
            data: { status: "CANCELLED" }
          }).catch(() => null);
        }
      }
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          entityType: "approval",
          entityId: id,
          action,
          beforeValue: serializeJson(before),
          afterValue: serializeJson(after),
          userId: user.id,
          userNameSnapshot: user.name,
          userRoleSnapshot: user.role,
          reason
        }
      });
      return after;
    });

    if (result.module === "pengeluaran") {
      if (result.status === "approved") {
        await postExpenseJournal(result.entityId, user).catch((err) => {
          console.error("[Auto-Journal Approval Error]", err);
        });
      } else if (result.status === "rejected") {
        await reverseExpenseJournal(result.entityId, reason || "Ditolak approval", user).catch((err) => {
          console.error("[Auto-Journal Reversal Error]", err);
        });
      }
    }

    return result;
  }
  const rows = await readJsonArray<ApprovalRequest>(fileName);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error("Approval tidak ditemukan.");
  const before = rows[index];
  const transitionError = validateApprovalTransition(before.status, action, reason);
  if (transitionError) throw new Error(transitionError);
  if (before.createdByUserId === user.id && user.role !== "OWNER") throw new Error("User tidak boleh approve data sendiri.");
  const now = new Date().toISOString();
  const after: ApprovalRequest = action === "approve"
    ? { ...before, status: "approved", approvedByUserId: user.id, approvedByNameSnapshot: user.name, approvedAt: now }
    : { ...before, status: "rejected", rejectedByUserId: user.id, rejectedByNameSnapshot: user.name, rejectedAt: now, rejectionReason: reason };
  rows[index] = after;
  await writeJsonArray(fileName, rows);
  if (after.module === "penjualan") {
    const sale = await updateSalesApprovalStatus(after.entityId, after.status === "approved" ? "approved" : after.status === "rejected" ? "rejected" : after.status);
    const fullSale = sale || await getSalesRecord(after.entityId);
    if (after.status === "approved" && fullSale?.paymentMethod === "Tempo") {
      const dueDate = fullSale.dueDate && new Date(fullSale.dueDate) < new Date(now) ? now : (fullSale.dueDate || fullSale.saleDate);
      await createTempoReceivable({
        salesId: fullSale.id, tipeId: fullSale.tipeId || "W", tipeCodeSnapshot: fullSale.tipeCodeSnapshot || "W", tipeNameSnapshot: fullSale.tipeNameSnapshot || "W",
        customerName: fullSale.customerName, originalAmount: fullSale.total,
        transactionDate: fullSale.saleDate,
        dueDate,
        initialPayment: { amount: fullSale.initialPaymentAmount || 0, method: fullSale.initialPaymentMethod, rekeningId: fullSale.initialPaymentRekeningId, rekeningNameSnapshot: fullSale.initialPaymentRekeningNameSnapshot, notes: fullSale.initialPaymentNotes }
      });
    }
  }
  if (after.module === "pengeluaran") await updateExpenseApprovalStatus(after.entityId, after.status === "approved" ? "approved" : after.status === "rejected" ? "rejected" : after.status);
  await recordAudit({ entityType: "approval", entityId: id, action, beforeValue: before, afterValue: after, reason });
  return after;
}
