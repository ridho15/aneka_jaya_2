import "server-only";
import { sendNeoCommand } from "./neo";
import type { PenjualanInput } from "@/lib/validation/penjualanSchema";
import type { ApiResponse } from "@/lib/types/api";
import type { Sale } from "@/lib/types/sales";
import { recordAudit } from "@/lib/audit/store";
import { createApprovalRequest, approvalIsEnabled } from "@/lib/approval/store";
import { createTempoReceivable } from "@/lib/tempo/store";
import { getCurrentUser } from "@/lib/auth/session";
import { findTipe, MasterDataError, rekeningForTipe } from "@/lib/business/masterData";
import { saveSalesRecord } from "@/lib/sales/store";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { erpTransactionTypeCodes, transactionTargetForType } from "@/lib/api/transactionRouting";
import type { Role } from "@/lib/auth/roles";

function serializeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

export function erpSalesTypeCodes(env: NodeJS.ProcessEnv = process.env) {
  return erpTransactionTypeCodes(env);
}

export function salesTargetForType(code: string, env: NodeJS.ProcessEnv = process.env): "erp" | "local" {
  return transactionTargetForType(code, env);
}

export function erpReferenceFrom(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const nested = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : undefined;
  const reference = row.reference ?? row.id ?? row.invoice_id ?? nested?.reference ?? nested?.id ?? nested?.invoice_id;
  return reference === undefined || reference === null ? undefined : String(reference);
}

export function safeErpSyncError(response: ApiResponse<unknown>) {
  if (response.success) return undefined;
  const code = response.code || "ERP_ERROR";
  if (code === "ERP_AUTH") return "ERP menolak akses. Silakan cek sesi atau token ERP.";
  if (code === "ERP_SESSION_REQUIRED") return "Sesi ERP tidak tersedia. Silakan masuk kembali.";
  if (code === "ERP_TIMEOUT") return "ERP timeout saat sinkronisasi.";
  if (code === "ERP_NOT_CONFIGURED") return "Konfigurasi ERP belum lengkap.";
  if (code === "ERP_NETWORK") return "Koneksi ERP bermasalah.";
  if (code === "ERP_VALIDATION") return response.message || "ERP menolak payload/data transaksi.";
  if (code === "ERP_NOT_FOUND") return response.message || "Endpoint/resource ERP tidak ditemukan.";
  return response.message || "ERP gagal memproses transaksi.";
}

export function buildSalesNeoCommand(input: {
  saleDate: string;
  tipeId?: string;
  tipeCodeSnapshot?: string;
  tipeNameSnapshot?: string;
  customerName: string;
  customerLocation?: string;
  paymentMethod: string;
  dueDate?: string;
  rekeningId?: string;
  deliveryDate?: string;
  shippingMethod?: string;
  transferAccount?: string;
  notes?: string;
  items: { productRef: string; quantity: number; unitPrice: number; discount?: number }[];
  testReference?: string;
  isTestTransaction?: boolean;
}) {
  const code = (input.tipeCodeSnapshot || "AJ").toUpperCase();
  return {
    text: `${input.testReference ? `[TEST ${code}] ${input.testReference}. ` : ""}Buat penjualan dan invoice penjualan untuk ${input.customerName} tanggal ${input.saleDate}.`,
    parsedIntent: {
      action: "create_sales",
      customer_name: input.customerName,
      date: input.saleDate,
      tipe_id: input.tipeId,
      tipe_code_snapshot: input.tipeCodeSnapshot,
      tipe_name_snapshot: input.tipeNameSnapshot,
      payment_status: input.paymentMethod,
      due_date: input.dueDate || undefined,
      rekening_id: input.rekeningId || undefined,
      delivery_date: input.deliveryDate || undefined,
      delivery_method: input.shippingMethod || undefined,
      auto_create_invoice: true,
      items: input.items.map((item) => ({ product_ref: item.productRef, quantity: item.quantity, unit_price: item.unitPrice, discount: item.discount || 0 })),
      test_reference: input.testReference,
      is_test_transaction: input.isTestTransaction === true,
      message: [`Lokasi customer: ${input.customerLocation}`, `Pembayaran: ${input.paymentMethod}${input.transferAccount ? ` - ${input.transferAccount}` : ""}`, input.notes || ""].filter(Boolean).join(". ")
    }
  };
}

async function persistErpSale(input: {
  sale: Sale;
  total: number;
  approvalStatus: NonNullable<Sale["approvalStatus"]>;
  paymentMethod: PenjualanInput["paymentMethod"];
  dueDate?: string;
  tipe: { id: string; code: string; name: string };
  user: { id: string; name: string; role: Role };
  auditReason: string;
}) {
  const { sale, total, approvalStatus, paymentMethod, dueDate, tipe, user, auditReason } = input;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.salesRecord.create({
      data: {
        id: sale.id,
        saleDate: new Date(sale.saleDate),
        tipeId: tipe.id,
        tipeCodeSnapshot: tipe.code,
        tipeNameSnapshot: tipe.name,
        customerName: sale.customerName,
        customerLocation: sale.customerLocation,
        shippingMethod: sale.shippingMethod,
        paymentMethod: sale.paymentMethod,
        dueDate: sale.dueDate ? new Date(sale.dueDate) : undefined,
        rekeningId: sale.rekeningId,
        transferAccount: sale.transferAccount,
        notes: sale.notes,
        total,
        approvalStatus,
        syncTarget: sale.syncTarget || "erp",
        syncStatus: sale.syncStatus || "failed",
        syncError: sale.syncError,
        syncAttemptedAt: sale.syncAttemptedAt ? new Date(sale.syncAttemptedAt) : undefined,
        syncedAt: sale.syncedAt ? new Date(sale.syncedAt) : undefined,
        erpReference: sale.erpReference,
        testReference: sale.testReference,
        isTestTransaction: sale.isTestTransaction || false,
        createdByUserId: user.id,
        createdByNameSnapshot: user.name,
        createdByRoleSnapshot: user.role,
        createdAt: new Date(sale.createdAt || Date.now()),
        items: {
          create: sale.items.map((item, index) => ({
            id: `${sale.id}-item-${index}`,
            productRef: item.productRef,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            sortOrder: index
          }))
        }
      }
    });
    if (approvalStatus === "pending_approval") {
      const approval = {
        id: `APR-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        module: "penjualan",
        entityId: sale.id,
        tipeCodeSnapshot: tipe.code,
        tipeNameSnapshot: tipe.name,
        amount: total,
        status: "pending_approval",
        createdByUserId: user.id,
        createdByNameSnapshot: user.name,
        createdByRoleSnapshot: user.role,
        createdAt: new Date()
      } as const;
      await tx.approvalRequest.create({ data: approval });
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          entityType: "approval",
          entityId: approval.id,
          action: "create",
          afterValue: serializeJson({ ...approval, createdAt: approval.createdAt.toISOString() }),
          userId: user.id,
          userNameSnapshot: user.name,
          userRoleSnapshot: user.role,
          reason: "penjualan pending_approval"
        }
      });
    }
    if (approvalStatus === "approved" && paymentMethod === "Tempo") {
      const now = new Date();
      await tx.tempoReceivable.create({
        data: {
          id: `TMP-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          salesId: sale.id,
          tipeId: tipe.id,
          tipeCodeSnapshot: tipe.code,
          tipeNameSnapshot: tipe.name,
          customerName: sale.customerName,
          originalAmount: total,
          paidAmount: 0,
          remainingAmount: total,
          transactionDate: new Date(sale.saleDate),
          dueDate: new Date(dueDate || sale.saleDate),
          status: "open",
          createdByUserId: user.id,
          createdByNameSnapshot: user.name,
          createdAt: now,
          updatedAt: now
        }
      });
    }
    await tx.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        entityType: "sales",
        entityId: sale.id,
        action: "create",
        afterValue: serializeJson(sale),
        userId: user.id,
        userNameSnapshot: user.name,
        userRoleSnapshot: user.role,
        reason: auditReason
      }
    });
  });
}

export async function createSale(input: PenjualanInput): Promise<ApiResponse<unknown>> {
  const total = input.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - (item.discount || 0)), 0);
  const user = await getCurrentUser();
  const tipe = await findTipe(input.tipeId);
  if (["Cash", "TF"].includes(input.paymentMethod)) {
    const rekenings = await rekeningForTipe(tipe.id);
    if (!input.rekeningId || !rekenings.some((rekening) => rekening.id === input.rekeningId)) {
      throw new MasterDataError("Rekening penerima tidak tersedia untuk tipe pembukuan yang dipilih.", "REKENING_NOT_FOUND");
    }
  }
  const approvalStatus = user.role === "ADMIN" && approvalIsEnabled("penjualan") ? "pending_approval" : "approved";
  const target = salesTargetForType(tipe.code);
  const isTestTransaction = target === "erp" && user.role === "OWNER" && input.isTestTransaction === true;
  const testReference = isTestTransaction ? `TEST-${tipe.code.toUpperCase()}-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}` : undefined;
  const customerName = testReference ? `[TEST ${tipe.code.toUpperCase()}] ${input.customerName}` : input.customerName;
  const notes = [input.notes, testReference ? `Transaksi pengujian ${testReference}` : ""].filter(Boolean).join(" • ") || undefined;
  const effectiveInput = { ...input, customerName, notes, isTestTransaction };

  if (target === "local") {
    const sale: Sale = { id: `S-${Date.now()}`, ...effectiveInput, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, total, approvalStatus, syncTarget: "local", syncStatus: "local", createdByUserId: user.id, createdByNameSnapshot: user.name, createdByRoleSnapshot: user.role, createdAt: new Date().toISOString() };
    await saveSalesRecord(sale);
    if (approvalStatus === "pending_approval") await createApprovalRequest({ module: "penjualan", entityId: sale.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, amount: total });
    if (approvalStatus === "approved" && input.paymentMethod === "Tempo") await createTempoReceivable({ salesId: sale.id, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, customerName: input.customerName, originalAmount: total, transactionDate: input.saleDate, dueDate: input.dueDate || input.saleDate });
    await recordAudit({ entityType: "sales", entityId: sale.id, action: "create", afterValue: sale, reason: `Invoice Penjualan lokal • ${approvalStatus} • ${input.paymentMethod}` });
    return { success: true, data: { ...sale, target: "local" } };
  }
  const response = await sendNeoCommand(buildSalesNeoCommand({ ...effectiveInput, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, testReference, isTestTransaction }));
  const attemptedAt = new Date().toISOString();
  if (response.success) {
    const erpReference = erpReferenceFrom(response.data);
    const sale: Sale = { id: `S-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, ...effectiveInput, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, total, approvalStatus, syncTarget: "erp", syncStatus: "synced", syncAttemptedAt: attemptedAt, syncedAt: attemptedAt, erpReference, testReference, isTestTransaction, createdByUserId: user.id, createdByNameSnapshot: user.name, createdByRoleSnapshot: user.role, createdAt: new Date().toISOString() };
    await persistErpSale({ sale, total, approvalStatus, paymentMethod: input.paymentMethod, dueDate: input.dueDate, tipe, user: { id: user.id, name: user.name, role: user.role }, auditReason: `Invoice Penjualan ${tipe.code} • Terkirim ke ERP • ${input.paymentMethod}${testReference ? ` • ${testReference}` : ""}` });
    return { success: true, data: { ...sale, target: "erp", erpReference, testReference } };
  }
  const syncError = safeErpSyncError(response);
  const sale: Sale = { id: `S-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, ...effectiveInput, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, total, approvalStatus, syncTarget: "erp", syncStatus: "failed", syncError, syncAttemptedAt: attemptedAt, testReference, isTestTransaction, createdByUserId: user.id, createdByNameSnapshot: user.name, createdByRoleSnapshot: user.role, createdAt: new Date().toISOString() };
  await persistErpSale({ sale, total, approvalStatus, paymentMethod: input.paymentMethod, dueDate: input.dueDate, tipe, user: { id: user.id, name: user.name, role: user.role }, auditReason: `Invoice Penjualan ${tipe.code} • ERP gagal, tersimpan untuk retry • ${syncError}` });
  return { success: true, data: { ...sale, target: "erp", retryable: true } };
}
