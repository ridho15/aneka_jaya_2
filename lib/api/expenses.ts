import "server-only";
import type { ApiResponse } from "@/lib/types/api";
import type { Expense } from "@/lib/types/expenses";
import type { PengeluaranInput } from "@/lib/validation/pengeluaranSchema";
import { sendNeoCommand } from "./neo";
import { recordAudit } from "@/lib/audit/store";
import { createApprovalRequest, approvalIsEnabled } from "@/lib/approval/store";
import { getCurrentUser } from "@/lib/auth/session";
import { findTipe } from "@/lib/business/masterData";
import { transactionTargetForType } from "@/lib/api/transactionRouting";

const usesLocalDataStore = () => process.env.NEXT_PUBLIC_APP_MODE !== "production";

export async function createExpense(input: PengeluaranInput): Promise<ApiResponse<unknown>> {
  const user = await getCurrentUser();
  const tipe = await findTipe(input.tipeId);
  const target = transactionTargetForType(tipe.code);
  const approvalStatus: NonNullable<Expense["approvalStatus"]> = user.role === "ADMIN" && approvalIsEnabled("pengeluaran") ? "pending_approval" : "approved";
  if (usesLocalDataStore()) {
    const expense: Expense = { id: `E-${Date.now()}`, ...input, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, attachmentUrl: input.attachmentUrl || undefined, approvalStatus, erpSyncStatus: target === "erp" ? "pending" : "not_required" };
    if (approvalStatus === "pending_approval") await createApprovalRequest({ module: "pengeluaran", entityId: expense.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, amount: input.amount });
    await recordAudit({ entityType: "expense", entityId: expense.id, action: "create", afterValue: expense, reason: `Pengeluaran lokal / COA ${input.coaNameSnapshot || "Kas"} • ${expense.erpSyncStatus}` });
    return { success: true, data: expense };
  }
  if (target === "local") {
    const expense: Expense = { id: `E-${Date.now()}`, ...input, approvalStatus, erpSyncStatus: "not_required" };
    if (approvalStatus === "pending_approval") await createApprovalRequest({ module: "pengeluaran", entityId: expense.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, amount: input.amount });
    await recordAudit({ entityType: "expense", entityId: expense.id, action: "create", afterValue: expense, reason: `Tipe ${tipe.code} disimpan lokal, ERP sync not_required` });
    return { success: true, data: expense };
  }
  // Neo's documented natural-language command envelope is used here because the supplied OpenAPI schema did not
  // expose a direct expense endpoint. The wording explicitly routes this expense to Buat Transaksi Kas & Bank,
  // as a cash-out transaction under COA Kas, without inventing a direct Finance request body.
  const response = await sendNeoCommand({
    text: `Buat Transaksi Kas & Bank transaksi keluar pada COA ${input.coaNameSnapshot || "Kas"}. Tipe ${tipe.code}. Rekening ${input.rekeningNameSnapshot}. Tanggal ${input.expenseDate}. Kategori ${input.category}. Penerima ${input.vendorName}. Deskripsi ${input.description}. Jumlah ${input.amount}. Metode pembayaran ${input.paymentMethod}.${input.attachmentUrl ? ` Lampiran: ${input.attachmentUrl}.` : ""}${input.notes ? ` Catatan: ${input.notes}.` : ""}`
  });
  if (response.success) {
    if (approvalStatus === "pending_approval") await createApprovalRequest({ module: "pengeluaran", entityId: input.vendorName, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, amount: input.amount });
    await recordAudit({ entityType: "expense", entityId: input.vendorName, action: "create", afterValue: input, reason: `Kas & Bank / COA ${input.coaNameSnapshot || "Kas"} • Terkirim` });
  }
  return response;
}
