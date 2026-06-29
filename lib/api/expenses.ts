import "server-only";
import type { ApiResponse } from "@/lib/types/api";
import type { Expense } from "@/lib/types/expenses";
import type { PengeluaranInput } from "@/lib/validation/pengeluaranSchema";
import { sendNeoCommand } from "./neo";
import { recordAudit } from "@/lib/audit/store";
import { createApprovalRequest, approvalIsEnabled } from "@/lib/approval/store";
import { getCurrentUser } from "@/lib/auth/session";
import { findTipe, rekeningForTipe } from "@/lib/business/masterData";
import { transactionTargetForType } from "@/lib/api/transactionRouting";
import { saveExpenseRecord } from "@/lib/expenses/store";
import { erpReferenceFrom, safeErpSyncError } from "@/lib/api/sales";

export function buildExpenseNeoCommand(input: Pick<Expense, "expenseDate" | "tipeCodeSnapshot" | "rekeningNameSnapshot" | "coaNameSnapshot" | "category" | "vendorName" | "description" | "amount" | "paymentMethod" | "attachmentUrl" | "notes">) {
  return {
    text: `Buat Transaksi Kas & Bank transaksi keluar pada COA ${input.coaNameSnapshot || "Kas"}. Tipe ${input.tipeCodeSnapshot || "AJ"}. Rekening ${input.rekeningNameSnapshot}. Tanggal ${input.expenseDate}. Kategori ${input.category}. Penerima ${input.vendorName}. Deskripsi ${input.description}. Jumlah ${input.amount}. Metode pembayaran ${input.paymentMethod}.${input.attachmentUrl ? ` Lampiran: ${input.attachmentUrl}.` : ""}${input.notes ? ` Catatan: ${input.notes}.` : ""}`
  };
}

export async function createExpense(input: PengeluaranInput): Promise<ApiResponse<unknown>> {
  const user = await getCurrentUser();
  const tipe = await findTipe(input.tipeId);
  const rekening = (await rekeningForTipe(tipe.id)).find((item) => item.id === input.rekeningId);
  if (!rekening) throw new Error("Rekening pengeluaran tidak tersedia untuk tipe transaksi ini.");
  const target = transactionTargetForType(tipe.code);
  const approvalStatus: NonNullable<Expense["approvalStatus"]> = user.role === "ADMIN" && approvalIsEnabled("pengeluaran") ? "pending_approval" : "approved";
  const baseExpense: Expense = {
    id: `E-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    ...input,
    tipeId: tipe.id,
    tipeCodeSnapshot: tipe.code,
    tipeNameSnapshot: tipe.name,
    rekeningId: rekening.id,
    rekeningNameSnapshot: rekening.name,
    attachmentUrl: input.attachmentUrl || undefined,
    approvalStatus,
    erpSyncTarget: target === "erp" ? "erp" : "local",
    createdByUserId: user.id,
    createdByNameSnapshot: user.name,
    createdByRoleSnapshot: user.role,
    createdAt: new Date().toISOString()
  };

  if (approvalStatus === "pending_approval") {
    const expense = await saveExpenseRecord({
      ...baseExpense,
      erpSyncStatus: target === "erp" ? "pending" : "not_required"
    });
    await createApprovalRequest({ module: "pengeluaran", entityId: expense.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, amount: input.amount });
    await recordAudit({
      entityType: "expense",
      entityId: expense.id,
      action: "create",
      afterValue: expense,
      reason: target === "erp"
        ? "Pengeluaran AJ menunggu approval sebelum dikirim ke ERP"
        : `Tipe ${tipe.code} disimpan lokal dan menunggu approval`
    });
    return { success: true, data: expense };
  }

  if (target === "local") {
    const expense = await saveExpenseRecord({ ...baseExpense, erpSyncStatus: "not_required" });
    await recordAudit({ entityType: "expense", entityId: expense.id, action: "create", afterValue: expense, reason: `Tipe ${tipe.code} disimpan lokal, ERP sync not_required` });
    return { success: true, data: expense };
  }
  const attemptedAt = new Date().toISOString();
  const response = await sendNeoCommand(buildExpenseNeoCommand(baseExpense));
  if (response.success) {
    const syncedAt = new Date().toISOString();
    const expense = await saveExpenseRecord({ ...baseExpense, erpSyncStatus: "synced", erpSyncAttemptedAt: attemptedAt, erpSyncedAt: syncedAt, erpReference: erpReferenceFrom(response.data) });
    await recordAudit({ entityType: "expense", entityId: expense.id, action: "create", afterValue: expense, reason: `Kas & Bank / COA ${input.coaNameSnapshot || "Kas"} • Terkirim ERP` });
    return { success: true, data: expense };
  }
  const erpSyncError = safeErpSyncError(response);
  const expense = await saveExpenseRecord({ ...baseExpense, erpSyncStatus: "failed", erpSyncError, erpSyncAttemptedAt: attemptedAt });
  await recordAudit({ entityType: "expense", entityId: expense.id, action: "create", afterValue: expense, reason: `Pengeluaran AJ gagal ERP, tersimpan untuk retry • ${erpSyncError}` });
  return { success: true, data: { ...expense, retryable: true } };
}
