import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/audit/store";
import { readJsonArray, writeJsonArray } from "@/lib/data/jsonStore";
import { getSalesRecord, updateSalesApprovalStatus } from "@/lib/sales/store";
import { createTempoReceivable } from "@/lib/tempo/store";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { type ApprovalAction, isApprovalAction, validateApprovalTransition } from "./validation";

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

export async function updateApprovalStatus(id: string, action: ApprovalAction, reason?: string): Promise<ApprovalRequest> {
  const user = await getCurrentUser();
  if (!can(user.role, "approval.approve")) throw new ApprovalForbiddenError();
  if (isProductionMode()) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
        const sale = await tx.salesRecord.update({ where: { id: after.entityId }, data: { approvalStatus: salesStatus } }).catch(() => null);
        if (after.status === "approved" && sale?.paymentMethod === "Tempo") {
          const existingTempo = await tx.tempoReceivable.findUnique({ where: { salesId: sale.id } });
          if (!existingTempo) {
            const createdAt = new Date();
            await tx.tempoReceivable.create({
              data: {
                id: `TMP-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                salesId: sale.id,
                tipeId: sale.tipeId,
                tipeCodeSnapshot: sale.tipeCodeSnapshot,
                tipeNameSnapshot: sale.tipeNameSnapshot,
                customerName: sale.customerName,
                originalAmount: sale.total,
                paidAmount: 0,
                remainingAmount: sale.total,
                transactionDate: sale.saleDate,
                dueDate: sale.dueDate || sale.saleDate,
                status: "open",
                createdByUserId: user.id,
                createdByNameSnapshot: user.name,
                createdAt,
                updatedAt: createdAt
              }
            });
          }
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
    if (after.status === "approved" && fullSale?.paymentMethod === "Tempo") await createTempoReceivable({ salesId: fullSale.id, tipeId: fullSale.tipeId || "W", tipeCodeSnapshot: fullSale.tipeCodeSnapshot || "W", tipeNameSnapshot: fullSale.tipeNameSnapshot || "W", customerName: fullSale.customerName, originalAmount: fullSale.total, transactionDate: fullSale.saleDate, dueDate: fullSale.dueDate || fullSale.saleDate });
  }
  await recordAudit({ entityType: "approval", entityId: id, action, beforeValue: before, afterValue: after, reason });
  return after;
}
