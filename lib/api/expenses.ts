import "server-only";
import type { ApiResponse } from "@/lib/types/api";
import type { Expense } from "@/lib/types/expenses";
import { labelForCategoryCode, type PengeluaranInput } from "@/lib/validation/pengeluaranSchema";
import { sendNeoCommand } from "./neo";
import { recordAudit } from "@/lib/audit/store";
import { getCurrentUser } from "@/lib/auth/session";
import { findTipe, rekeningForTipe } from "@/lib/business/masterData";
import { expenseTargetForTypeCode } from "@/lib/api/transactionRouting";
import { isErpTransactionSyncEnabled } from "@/lib/settings/erpSync";
import { saveExpenseRecord } from "@/lib/expenses/store";
import { erpReferenceFrom, safeErpSyncError } from "@/lib/api/sales";
import { approvalIsEnabled, createApprovalRequest } from "@/lib/approval/store";
import { prisma } from "@/lib/db/prisma";
import { postExpenseJournal } from "@/lib/accounting/postingHooks";
import type { Role } from "@/lib/auth/roles";

export function buildExpenseNeoCommand(input: Pick<Expense, "expenseDate" | "tipeCodeSnapshot" | "rekeningNameSnapshot" | "coaNameSnapshot" | "category" | "vendorName" | "description" | "amount" | "paymentMethod" | "attachmentUrl" | "notes">) {
  return {
    text: `Buat Transaksi Kas & Bank transaksi keluar pada COA ${input.coaNameSnapshot || "Kas"}. Tipe ${input.tipeCodeSnapshot || "AJ"}. Rekening ${input.rekeningNameSnapshot}. Tanggal ${input.expenseDate}. Kategori ${input.category}. Penerima ${input.vendorName}. Deskripsi ${input.description}. Jumlah ${input.amount}. Metode pembayaran ${input.paymentMethod}.${input.attachmentUrl ? ` Lampiran: ${input.attachmentUrl}.` : ""}${input.notes ? ` Catatan: ${input.notes}.` : ""}`
  };
}

async function createSdmSubledgerForExpense(expense: Expense, actor: { id: string; name: string }) {
  if (!expense.employeeId) return;

  const isApproved = expense.approvalStatus === "approved";
  const initialStatus = expense.approvalStatus === "rejected" || expense.approvalStatus === "cancelled" ? "CANCELLED" : "ACTIVE";

  if (expense.categoryCode === "employee_loan") {
    const existing = await prisma.employeeLoan.findFirst({ where: { expenseRecordId: expense.id } });
    if (!existing) {
      await prisma.employeeLoan.create({
        data: {
          employeeId: expense.employeeId,
          expenseRecordId: expense.id,
          loanType: "KASBON",
          amount: expense.amount,
          paidAmount: 0,
          remainingAmount: expense.amount,
          disbursedDate: new Date(expense.expenseDate),
          dueDate: expense.dueDate ? new Date(expense.dueDate) : null,
          purpose: expense.purpose || expense.description,
          status: initialStatus,
          notes: expense.notes || null
        }
      });
    }
  } else if (expense.categoryCode === "operational_advance") {
    const existing = await prisma.employeeLoan.findFirst({ where: { expenseRecordId: expense.id } });
    if (!existing) {
      await prisma.employeeLoan.create({
        data: {
          employeeId: expense.employeeId,
          expenseRecordId: expense.id,
          loanType: "UANG_MUKA",
          amount: expense.amount,
          paidAmount: 0,
          remainingAmount: expense.amount,
          disbursedDate: new Date(expense.expenseDate),
          dueDate: expense.dueDate ? new Date(expense.dueDate) : null,
          purpose: expense.purpose || expense.description,
          status: initialStatus,
          notes: expense.notes || null
        }
      });
    }
  } else if (expense.categoryCode === "salary" && expense.salaryPeriod) {
    const existing = await prisma.employeeSalaryPayment.findFirst({ where: { expenseRecordId: expense.id } });
    if (!existing) {
      await prisma.employeeSalaryPayment.create({
        data: {
          employeeId: expense.employeeId,
          expenseRecordId: expense.id,
          periodMonth: expense.salaryPeriod,
          paymentDate: new Date(expense.expenseDate),
          amountPaid: expense.amount,
          rekeningId: expense.rekeningId || "",
          rekeningNameSnapshot: expense.rekeningNameSnapshot || "",
          paymentMethod: expense.paymentMethod,
          attachmentUrl: expense.attachmentUrl || null,
          notes: expense.notes || null,
          createdByUserId: actor.id,
          createdByNameSnapshot: actor.name
        }
      });
    }
  }

  // Auto-journal jika status pengeluaran disetujui
  if (expense.approvalStatus === "approved") {
    await postExpenseJournal(expense.id, {
      id: actor.id,
      name: actor.name,
      role: (actor as { id: string; name: string; role?: Role }).role || "FINANCE"
    }).catch((err) => {
      console.error("[Auto-Journal Expense Error]", err);
    });
  }
}

export async function createExpense(input: PengeluaranInput & { approvalStatus?: Expense["approvalStatus"] }): Promise<ApiResponse<unknown>> {
  const user = await getCurrentUser();
  const tipe = await findTipe(input.tipeId);
  const rekening = (await rekeningForTipe(tipe.id)).find((item) => item.id === input.rekeningId);
  if (!rekening) throw new Error("Rekening pengeluaran tidak tersedia untuk tipe transaksi ini.");
  const isSyncEnabled = await isErpTransactionSyncEnabled();
  const target = expenseTargetForTypeCode(tipe.code, process.env, isSyncEnabled);

  // Status approval: jika eksplisit diberikan, gunakan itu.
  // Jika tidak, cek apakah role user ADMIN dan require approval diaktifkan secara eksplisit (misal kasbon pending test).
  let approvalStatus: NonNullable<Expense["approvalStatus"]> = input.approvalStatus || "approved";
  if (!input.approvalStatus && user.role === "ADMIN" && approvalIsEnabled("pengeluaran") && target === "local") {
    approvalStatus = "pending_approval";
  }

  const categoryLabel = input.category && input.category !== "Beban operasional"
    ? input.category
    : labelForCategoryCode(input.categoryCode || "operational_expense");

  let coaId = input.coaId;
  let coaNameSnapshot = input.coaNameSnapshot;
  if (input.categoryCode === "salary") {
    if (input.salaryPaymentType === "PAYABLE") {
      coaId = "2-1002";
      coaNameSnapshot = "Utang Gaji";
    } else {
      coaId = "6-1002";
      coaNameSnapshot = "Beban Gaji Karyawan";
    }
  }

  const baseExpense: Expense = {
    id: `E-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    ...input,
    coaId: coaId || "Kas",
    coaNameSnapshot: coaNameSnapshot || "Kas",
    category: categoryLabel,
    categoryCode: input.categoryCode || "operational_expense",
    employeeId: input.employeeId || undefined,
    salaryPeriod: input.salaryPeriod || undefined,
    salaryPaymentType: input.salaryPaymentType || "EXPENSE",
    dueDate: input.dueDate || undefined,
    purpose: input.purpose || undefined,
    postingStatus: "unposted",
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

  if (target === "local") {
    const expense = await saveExpenseRecord({ ...baseExpense, erpSyncStatus: "not_required" });
    await createSdmSubledgerForExpense(expense, user);
    if (approvalStatus === "pending_approval") {
      await createApprovalRequest({
        module: "pengeluaran",
        entityId: expense.id,
        tipeCodeSnapshot: tipe.code,
        tipeNameSnapshot: tipe.name,
        amount: expense.amount,
        status: "pending_approval"
      });
    }
    await recordAudit({ entityType: "expense", entityId: expense.id, action: "create", afterValue: expense, reason: `Tipe ${tipe.code} (${expense.category}) disimpan lokal, ERP sync not_required` });
    return { success: true, data: expense };
  }

  const attemptedAt = new Date().toISOString();
  const response = await sendNeoCommand(buildExpenseNeoCommand(baseExpense));
  if (response.success) {
    const syncedAt = new Date().toISOString();
    const expense = await saveExpenseRecord({ ...baseExpense, erpSyncStatus: "synced", erpSyncAttemptedAt: attemptedAt, erpSyncedAt: syncedAt, erpReference: erpReferenceFrom(response.data) });
    await createSdmSubledgerForExpense(expense, user);
    await recordAudit({ entityType: "expense", entityId: expense.id, action: "create", afterValue: expense, reason: `Kas & Bank / COA ${input.coaNameSnapshot || "Kas"} • Terkirim ERP` });
    return { success: true, data: expense };
  }

  const erpSyncError = safeErpSyncError(response);
  const expense = await saveExpenseRecord({ ...baseExpense, erpSyncStatus: "failed", erpSyncError, erpSyncAttemptedAt: attemptedAt });
  await createSdmSubledgerForExpense(expense, user);
  await recordAudit({ entityType: "expense", entityId: expense.id, action: "create", afterValue: expense, reason: `Pengeluaran AJ gagal ERP, tersimpan untuk retry • ${erpSyncError}` });
  return { success: true, data: { ...expense, retryable: true } };
}
