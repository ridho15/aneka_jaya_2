import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/auth/roles";
import type { Expense } from "@/lib/types/expenses";
import type { PengeluaranInput } from "@/lib/validation/pengeluaranSchema";
import { recordAudit } from "@/lib/audit/store";
import { findTipe, rekeningForTipe } from "@/lib/business/masterData";
import { jakartaDateKey } from "@/lib/date/jakarta";

type ExpenseRecordRow = Prisma.ExpenseRecordGetPayload<object>;
export type ExpenseRecordFilters = {
  from?: string;
  to?: string;
  keyword?: string;
  tipe?: string;
  rekening?: string;
  approvalStatus?: string;
  erpSyncStatus?: string;
};
export type PaginatedExpenseRecords = {
  data: Expense[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

function cleanPage(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 1;
}

function cleanPageSize(value: number | undefined) {
  const size = Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 50;
  return Math.min(size, 100);
}

function dateStart(value: string) {
  return new Date(`${value}T00:00:00.000`);
}

function dateEnd(value: string) {
  return new Date(`${value}T23:59:59.999`);
}

function buildExpenseWhere(filters: ExpenseRecordFilters): Prisma.ExpenseRecordWhereInput {
  const where: Prisma.ExpenseRecordWhereInput = {};
  if (filters.from || filters.to) {
    where.expenseDate = {};
    if (filters.from) where.expenseDate.gte = dateStart(filters.from);
    if (filters.to) where.expenseDate.lte = dateEnd(filters.to);
  }
  if (filters.tipe) where.OR = [{ tipeCodeSnapshot: filters.tipe }, { tipeId: filters.tipe }];
  if (filters.rekening) {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: [{ rekeningNameSnapshot: filters.rekening }, { rekeningId: filters.rekening }] }];
  }
  if (filters.approvalStatus) where.approvalStatus = filters.approvalStatus;
  if (filters.erpSyncStatus) where.erpSyncStatus = filters.erpSyncStatus;
  const keyword = filters.keyword?.trim();
  if (keyword) {
    const keywordOr: Prisma.ExpenseRecordWhereInput[] = [
      { id: { contains: keyword, mode: "insensitive" } },
      { vendorName: { contains: keyword, mode: "insensitive" } },
      { description: { contains: keyword, mode: "insensitive" } },
      { category: { contains: keyword, mode: "insensitive" } },
      { coaNameSnapshot: { contains: keyword, mode: "insensitive" } },
      { notes: { contains: keyword, mode: "insensitive" } },
      { createdByNameSnapshot: { contains: keyword, mode: "insensitive" } }
    ];
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: keywordOr }];
  }
  return where;
}

export function toExpense(row: ExpenseRecordRow): Expense {
  return {
    id: row.id,
    expenseDate: jakartaDateKey(row.expenseDate),
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
    erpSyncError: row.erpSyncError || undefined,
    erpSyncAttemptedAt: row.erpSyncAttemptedAt?.toISOString(),
    erpSyncedAt: row.erpSyncedAt?.toISOString(),
    erpReference: row.erpReference || undefined,
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdByRoleSnapshot: row.createdByRoleSnapshot,
    createdAt: row.createdAt.toISOString()
  };
}

export async function saveExpenseRecord(expense: Expense): Promise<Expense> {
  const row = await prisma.expenseRecord.create({
    data: {
      id: expense.id,
      expenseDate: new Date(expense.expenseDate),
      tipeId: expense.tipeId || "W",
      tipeCodeSnapshot: expense.tipeCodeSnapshot || "W",
      tipeNameSnapshot: expense.tipeNameSnapshot || "W",
      rekeningId: expense.rekeningId || "",
      rekeningNameSnapshot: expense.rekeningNameSnapshot || "",
      coaId: expense.coaId || "Kas",
      coaNameSnapshot: expense.coaNameSnapshot || "Kas",
      category: expense.category,
      vendorName: expense.vendorName,
      description: expense.description,
      amount: expense.amount,
      paymentMethod: expense.paymentMethod,
      attachmentUrl: expense.attachmentUrl,
      notes: expense.notes,
      approvalStatus: expense.approvalStatus || "approved",
      erpSyncTarget: expense.erpSyncTarget || "local",
      erpSyncStatus: expense.erpSyncStatus || "not_required",
      erpSyncError: expense.erpSyncError,
      erpSyncAttemptedAt: expense.erpSyncAttemptedAt ? new Date(expense.erpSyncAttemptedAt) : undefined,
      erpSyncedAt: expense.erpSyncedAt ? new Date(expense.erpSyncedAt) : undefined,
      erpReference: expense.erpReference,
      createdByUserId: expense.createdByUserId || "system",
      createdByNameSnapshot: expense.createdByNameSnapshot || "System",
      createdByRoleSnapshot: (expense.createdByRoleSnapshot || "OWNER") as Role,
      createdAt: expense.createdAt ? new Date(expense.createdAt) : new Date()
    }
  });
  return toExpense(row);
}

export async function getExpenseRecord(id: string): Promise<Expense | undefined> {
  const row = await prisma.expenseRecord.findUnique({ where: { id } });
  return row ? toExpense(row) : undefined;
}

export async function listExpenseRecords(): Promise<Expense[]> {
  const rows = await prisma.expenseRecord.findMany({ orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }] });
  return rows.map(toExpense);
}

export async function listExpenseRecordsPage(input: { page?: number; pageSize?: number; filters?: ExpenseRecordFilters } = {}): Promise<PaginatedExpenseRecords> {
  const page = cleanPage(input.page);
  const pageSize = cleanPageSize(input.pageSize);
  const where = buildExpenseWhere(input.filters || {});
  const [total, rows] = await Promise.all([
    prisma.expenseRecord.count({ where }),
    prisma.expenseRecord.findMany({
      where,
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);
  return { data: rows.map(toExpense), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function listExpenseFilterOptions(): Promise<{ tipeOptions: string[]; rekeningOptions: string[] }> {
  const [tipeRows, rekeningRows] = await Promise.all([
    prisma.expenseRecord.findMany({ distinct: ["tipeCodeSnapshot"], select: { tipeCodeSnapshot: true }, orderBy: { tipeCodeSnapshot: "asc" } }),
    prisma.expenseRecord.findMany({ distinct: ["rekeningNameSnapshot"], select: { rekeningNameSnapshot: true }, orderBy: { rekeningNameSnapshot: "asc" } })
  ]);
  return {
    tipeOptions: tipeRows.map((row) => row.tipeCodeSnapshot).filter(Boolean),
    rekeningOptions: rekeningRows.map((row) => row.rekeningNameSnapshot).filter(Boolean)
  };
}

export async function updateExpenseApprovalStatus(id: string, status: NonNullable<Expense["approvalStatus"]>): Promise<Expense | undefined> {
  const data: Prisma.ExpenseRecordUpdateInput = { approvalStatus: status };
  if (status === "rejected") {
    data.erpSyncStatus = "not_required";
    data.erpSyncError = "Pengeluaran ditolak approval.";
  }
  const row = await prisma.expenseRecord.update({ where: { id }, data }).catch(() => null);
  return row ? toExpense(row) : undefined;
}

function assertExpenseManageable(expense: Expense) {
  if (expense.approvalStatus === "cancelled") throw new Error("Pengeluaran sudah dibatalkan.");
  if (expense.erpSyncTarget === "erp" && expense.erpSyncStatus === "synced") {
    throw new Error("Pengeluaran AJ yang sudah tersinkron ERP tidak bisa diubah langsung. Buat koreksi melalui ERP atau mekanisme koreksi resmi.");
  }
}

export async function updateExpenseRecord(id: string, input: PengeluaranInput): Promise<Expense> {
  const before = await getExpenseRecord(id);
  if (!before) throw new Error("Pengeluaran tidak ditemukan.");
  assertExpenseManageable(before);
  const tipe = await findTipe(input.tipeId || before.tipeId);
  const rekening = (await rekeningForTipe(tipe.id)).find((item) => item.id === input.rekeningId);
  if (!rekening) throw new Error("Rekening pengeluaran tidak tersedia untuk tipe transaksi ini.");
  const row = await prisma.expenseRecord.update({
    where: { id },
    data: {
      expenseDate: new Date(input.expenseDate),
      tipeId: tipe.id,
      tipeCodeSnapshot: tipe.code,
      tipeNameSnapshot: tipe.name,
      rekeningId: rekening.id,
      rekeningNameSnapshot: rekening.name,
      coaId: input.coaId || "Kas",
      coaNameSnapshot: input.coaNameSnapshot || "Kas",
      category: input.category,
      vendorName: input.vendorName,
      description: input.description,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      attachmentUrl: input.attachmentUrl || null,
      notes: input.notes,
      erpSyncStatus: before.erpSyncTarget === "erp" ? "pending" : "not_required",
      erpSyncError: before.erpSyncTarget === "erp" ? "Pengeluaran diubah dan menunggu sinkronisasi ulang." : null,
      erpSyncedAt: before.erpSyncTarget === "erp" ? null : before.erpSyncedAt ? new Date(before.erpSyncedAt) : null
    }
  });
  const after = toExpense(row);
  await recordAudit({ entityType: "expense", entityId: id, action: "update", beforeValue: before, afterValue: after, reason: before.erpSyncTarget === "erp" ? "Edit pengeluaran ERP belum synced • masuk antrian sync ulang" : "Edit pengeluaran lokal" });
  return after;
}

export async function cancelExpenseRecord(id: string, reason: string): Promise<Expense> {
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("Alasan cancel wajib diisi.");
  const before = await getExpenseRecord(id);
  if (!before) throw new Error("Pengeluaran tidak ditemukan.");
  assertExpenseManageable(before);
  const row = await prisma.expenseRecord.update({
    where: { id },
    data: {
      approvalStatus: "cancelled",
      erpSyncStatus: before.erpSyncTarget === "erp" ? "not_required" : before.erpSyncStatus || "not_required",
      erpSyncError: before.erpSyncTarget === "erp" ? "Pengeluaran dibatalkan sebelum berhasil tersinkron ERP." : before.erpSyncError
    }
  });
  const after = toExpense(row);
  await recordAudit({ entityType: "expense", entityId: id, action: "cancel", beforeValue: before, afterValue: after, reason: cleanReason });
  return after;
}
