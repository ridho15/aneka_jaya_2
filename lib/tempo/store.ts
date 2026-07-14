import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/audit/store";
import { readJsonArray, writeJsonArray } from "@/lib/data/jsonStore";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { rekeningForTipe } from "@/lib/business/masterData";
import { syncErpSalesPayment } from "@/lib/api/salesPayments";

export type TempoStatus = "open" | "paid" | "partial_paid" | "overdue" | "cancelled" | "written_off";

export type TempoReceivable = {
  id: string;
  salesId: string;
  tipeId: string;
  tipeCodeSnapshot: string;
  tipeNameSnapshot: string;
  customerName: string;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  transactionDate: string;
  dueDate: string;
  status: TempoStatus;
  createdByUserId: string;
  createdByNameSnapshot: string;
  createdAt: string;
  updatedAt: string;
};

export type TempoPayment = {
  id: string;
  tempoReceivableId: string;
  paymentDate: string;
  amountPaid: number;
  paymentMethod: "Cash" | "TF" | "Other";
  rekeningId: string;
  rekeningNameSnapshot: string;
  attachmentUrl?: string;
  notes?: string;
  erpPaymentStatus?: "not_required" | "pending" | "paid" | "partial" | "failed";
  erpPaymentError?: string;
  erpPaymentReference?: string;
  erpPaymentSyncedAt?: string;
  erpPaymentAttemptedAt?: string;
  createdByUserId: string;
  createdByNameSnapshot: string;
  createdAt: string;
};

const receivableFile = "tempo-receivables.json";
const paymentFile = "tempo-payments.json";
const isProductionMode = () => process.env.NEXT_PUBLIC_APP_MODE === "production";
const finalStatuses: TempoStatus[] = ["paid", "cancelled", "written_off"];
const activeStatuses: TempoStatus[] = ["open", "overdue", "partial_paid"];
export type TempoReceivableFilters = {
  keyword?: string;
  tipe?: string;
  status?: string;
  dueFrom?: string;
  dueTo?: string;
  includeFinal?: boolean;
};
export type PaginatedTempoReceivables = {
  data: TempoReceivable[];
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

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function todayStart() {
  return dateStart(todayDateString());
}

function applyOverdueStatus(row: TempoReceivable): TempoReceivable {
  return row.status === "open" && row.dueDate < todayDateString() ? { ...row, status: "overdue" } : row;
}

function buildTempoWhere(filters: TempoReceivableFilters): Prisma.TempoReceivableWhereInput {
  const where: Prisma.TempoReceivableWhereInput = {};
  const and: Prisma.TempoReceivableWhereInput[] = [];
  if (!filters.includeFinal) and.push({ status: { notIn: finalStatuses } });
  if (filters.tipe) and.push({ OR: [{ tipeCodeSnapshot: filters.tipe }, { tipeId: filters.tipe }] });
  if (filters.dueFrom || filters.dueTo) {
    const dueDate: Prisma.DateTimeFilter = {};
    if (filters.dueFrom) dueDate.gte = dateStart(filters.dueFrom);
    if (filters.dueTo) dueDate.lte = dateEnd(filters.dueTo);
    and.push({ dueDate });
  }
  if (filters.status) {
    if (filters.status === "overdue") {
      and.push({ status: "open", dueDate: { lt: todayStart() } });
    } else if (filters.status === "open") {
      and.push({ status: "open", dueDate: { gte: todayStart() } });
    } else {
      and.push({ status: filters.status as TempoStatus });
    }
  }
  const keyword = filters.keyword?.trim();
  if (keyword) {
    and.push({
      OR: [
        { id: { contains: keyword, mode: "insensitive" } },
        { salesId: { contains: keyword, mode: "insensitive" } },
        { customerName: { contains: keyword, mode: "insensitive" } },
        { createdByNameSnapshot: { contains: keyword, mode: "insensitive" } }
      ]
    });
  }
  if (and.length) where.AND = and;
  return where;
}

function filterTempoInMemory(rows: TempoReceivable[], filters: TempoReceivableFilters) {
  const keyword = filters.keyword?.trim().toLowerCase();
  return rows.map(applyOverdueStatus).filter((row) => {
    if (!filters.includeFinal && finalStatuses.includes(row.status)) return false;
    if (keyword) {
      const haystack = [row.id, row.salesId, row.customerName, row.createdByNameSnapshot].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    if (filters.tipe && (row.tipeCodeSnapshot || row.tipeId) !== filters.tipe) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.dueFrom && row.dueDate < filters.dueFrom) return false;
    if (filters.dueTo && row.dueDate > filters.dueTo) return false;
    return true;
  });
}

function serializeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function toTempoReceivable(row: Awaited<ReturnType<typeof prisma.tempoReceivable.findMany>>[number]): TempoReceivable {
  return {
    id: row.id,
    salesId: row.salesId,
    tipeId: row.tipeId,
    tipeCodeSnapshot: row.tipeCodeSnapshot,
    tipeNameSnapshot: row.tipeNameSnapshot,
    customerName: row.customerName,
    originalAmount: Number(row.originalAmount),
    paidAmount: Number(row.paidAmount),
    remainingAmount: Number(row.remainingAmount),
    transactionDate: row.transactionDate.toISOString().slice(0, 10),
    dueDate: row.dueDate.toISOString().slice(0, 10),
    status: row.status as TempoStatus,
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toTempoPayment(row: Awaited<ReturnType<typeof prisma.tempoPayment.findMany>>[number]): TempoPayment {
  return {
    id: row.id,
    tempoReceivableId: row.tempoReceivableId,
    paymentDate: row.paymentDate.toISOString().slice(0, 10),
    amountPaid: Number(row.amountPaid),
    paymentMethod: row.paymentMethod as TempoPayment["paymentMethod"],
    rekeningId: row.rekeningId,
    rekeningNameSnapshot: row.rekeningNameSnapshot,
    attachmentUrl: row.attachmentUrl || undefined,
    notes: row.notes || undefined,
    erpPaymentStatus: row.erpPaymentStatus as TempoPayment["erpPaymentStatus"],
    erpPaymentError: row.erpPaymentError || undefined,
    erpPaymentReference: row.erpPaymentReference || undefined,
    erpPaymentSyncedAt: row.erpPaymentSyncedAt?.toISOString(),
    erpPaymentAttemptedAt: row.erpPaymentAttemptedAt?.toISOString(),
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdAt: row.createdAt.toISOString()
  };
}

function isSyncablePaymentMethod(method: string) {
  return method === "Cash" || method === "TF";
}

function paymentSyncError(response: { success: false; message?: string }) {
  return response.message || "Payment ERP gagal dibuat.";
}

async function syncTempoPaymentToErp(receivable: TempoReceivable, payment: TempoPayment): Promise<TempoPayment> {
  if (!isProductionMode() || !isSyncablePaymentMethod(payment.paymentMethod)) return payment;
  const salesDelegate = (prisma as typeof prisma & { salesRecord?: typeof prisma.salesRecord }).salesRecord;
  if (!salesDelegate) return payment;
  const sale = await salesDelegate.findUnique({ where: { id: receivable.salesId } });
  if (!sale || sale.syncTarget !== "erp" || sale.syncStatus !== "synced") return payment;
  const attemptedAt = new Date();
  if (sale.stockReleaseStatus !== "released") {
    const error = "Payment ERP menunggu release stok berhasil.";
    const updated = await prisma.tempoPayment.update({ where: { id: payment.id }, data: { erpPaymentStatus: "pending", erpPaymentError: error, erpPaymentAttemptedAt: attemptedAt } });
    await prisma.salesRecord.update({ where: { id: sale.id }, data: { erpPaymentStatus: "pending", erpPaymentError: error, erpPaymentAttemptedAt: attemptedAt } });
    return toTempoPayment(updated);
  }
  const rekening = (await rekeningForTipe(receivable.tipeId)).find((item) => item.id === payment.rekeningId);
  const paymentReference = payment.erpPaymentReference || `SLM-PAY-${payment.id}`.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100);
  const response = await syncErpSalesPayment({
    erpReference: paymentReference,
    invoiceNumber: sale.erpReference || undefined,
    invoiceId: 0,
    customerId: 0,
    paymentDate: payment.paymentDate,
    coaCode: rekening?.erpCoaId || "",
    paymentMethod: payment.paymentMethod,
    amount: payment.amountPaid,
    notes: `Pembayaran Tempo SLM ${sale.erpReference || sale.id}`
  });
  if (response.success) {
    const updated = await prisma.tempoPayment.update({
      where: { id: payment.id },
      data: { erpPaymentStatus: response.data.status, erpPaymentError: null, erpPaymentReference: response.data.paymentReference, erpPaymentSyncedAt: attemptedAt, erpPaymentAttemptedAt: attemptedAt }
    });
    await prisma.salesRecord.update({ where: { id: sale.id }, data: { erpPaymentStatus: response.data.status, erpPaymentError: null, erpPaymentReference: response.data.paymentReference, erpPaymentSyncedAt: attemptedAt, erpPaymentAttemptedAt: attemptedAt } });
    await recordAudit({ entityType: "erp_sync", entityId: payment.id, action: "retry_sync", afterValue: { status: response.data.status, paymentReference: response.data.paymentReference }, reason: "Payment Tempo tersinkron ke ERP" });
    return toTempoPayment(updated);
  }
  const error = paymentSyncError(response);
  const updated = await prisma.tempoPayment.update({ where: { id: payment.id }, data: { erpPaymentStatus: "failed", erpPaymentError: error, erpPaymentAttemptedAt: attemptedAt } });
  await prisma.salesRecord.update({ where: { id: sale.id }, data: { erpPaymentStatus: "failed", erpPaymentError: error, erpPaymentAttemptedAt: attemptedAt } });
  await recordAudit({ entityType: "erp_sync", entityId: payment.id, action: "retry_sync", afterValue: { status: "failed", error }, reason: `Payment Tempo ERP gagal • ${error}` });
  return toTempoPayment(updated);
}

export async function createTempoReceivable(input: Omit<TempoReceivable, "id" | "paidAmount" | "remainingAmount" | "status" | "createdByUserId" | "createdByNameSnapshot" | "createdAt" | "updatedAt">): Promise<TempoReceivable> {
  const user = await getCurrentUser();
  const now = new Date().toISOString();
  const receivable: TempoReceivable = {
    id: `TMP-${Date.now()}`,
    paidAmount: 0,
    remainingAmount: input.originalAmount,
    status: "open",
    createdByUserId: user.id,
    createdByNameSnapshot: user.name,
    createdAt: now,
    updatedAt: now,
    ...input
  };
  if (isProductionMode()) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.tempoReceivable.findUnique({ where: { salesId: input.salesId } });
      if (existing) return toTempoReceivable(existing);
      const created = await tx.tempoReceivable.create({
        data: {
          ...receivable,
          transactionDate: new Date(receivable.transactionDate),
          dueDate: new Date(receivable.dueDate),
          createdAt: new Date(receivable.createdAt),
          updatedAt: new Date(receivable.updatedAt)
        }
      });
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          entityType: "tempo",
          entityId: receivable.id,
          action: "create",
          afterValue: serializeJson(receivable),
          userId: user.id,
          userNameSnapshot: user.name,
          userRoleSnapshot: user.role,
          reason: "Tempo dibuat dari Input Penjualan"
        }
      });
      return toTempoReceivable(created);
    });
  }
  const rows = await readJsonArray<TempoReceivable>(receivableFile);
  rows.unshift(receivable);
  await writeJsonArray(receivableFile, rows);
  await recordAudit({ entityType: "tempo", entityId: receivable.id, action: "create", afterValue: receivable, reason: "Tempo dibuat dari Input Penjualan" });
  return receivable;
}

export async function listTempoReceivables(): Promise<TempoReceivable[]> {
  if (isProductionMode()) {
    const rows = await prisma.tempoReceivable.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toTempoReceivable).map(applyOverdueStatus);
  }
  const rows = await readJsonArray<TempoReceivable>(receivableFile);
  return rows.map(applyOverdueStatus);
}

export async function listTempoReceivablesPage(input: { page?: number; pageSize?: number; filters?: TempoReceivableFilters } = {}): Promise<PaginatedTempoReceivables> {
  const page = cleanPage(input.page);
  const pageSize = cleanPageSize(input.pageSize);
  if (isProductionMode()) {
    const where = buildTempoWhere(input.filters || {});
    const [total, rows] = await Promise.all([
      prisma.tempoReceivable.count({ where }),
      prisma.tempoReceivable.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    return { data: rows.map(toTempoReceivable).map(applyOverdueStatus), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }
  const filtered = filterTempoInMemory(await readJsonArray<TempoReceivable>(receivableFile), input.filters || {});
  const total = filtered.length;
  return { data: filtered.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function listTempoTipeOptions(): Promise<string[]> {
  if (isProductionMode()) {
    const rows = await prisma.tempoReceivable.findMany({
      distinct: ["tipeCodeSnapshot"],
      select: { tipeCodeSnapshot: true },
      orderBy: { tipeCodeSnapshot: "asc" }
    });
    return rows.map((row) => row.tipeCodeSnapshot).filter(Boolean);
  }
  return Array.from(new Set((await readJsonArray<TempoReceivable>(receivableFile)).map((row) => row.tipeCodeSnapshot || row.tipeId).filter(Boolean))).sort();
}

export async function getTempoReceivable(id: string): Promise<TempoReceivable | undefined> {
  if (isProductionMode()) {
    const row = await prisma.tempoReceivable.findUnique({ where: { id } });
    if (!row) return undefined;
    const receivable = toTempoReceivable(row);
    const today = new Date().toISOString().slice(0, 10);
    return receivable.status === "open" && receivable.dueDate < today ? { ...receivable, status: "overdue" as TempoStatus } : receivable;
  }
  return (await listTempoReceivables()).find((row) => row.id === id);
}

export async function listTempoPayments(tempoReceivableId?: string): Promise<TempoPayment[]> {
  if (isProductionMode()) {
    const rows = await prisma.tempoPayment.findMany({
      where: tempoReceivableId ? { tempoReceivableId } : undefined,
      orderBy: { createdAt: "desc" }
    });
    return rows.map(toTempoPayment);
  }
  const rows = await readJsonArray<TempoPayment>(paymentFile);
  return tempoReceivableId ? rows.filter((row) => row.tempoReceivableId === tempoReceivableId) : rows;
}

export async function payTempo(id: string, input: Omit<TempoPayment, "id" | "tempoReceivableId" | "createdByUserId" | "createdByNameSnapshot" | "createdAt">): Promise<{ receivable: TempoReceivable; payment: TempoPayment }> {
  const user = await getCurrentUser();
  if (!can(user.role, "tempo.mark_paid")) throw new Error("Tidak punya akses bayar Tempo.");
  if (!Number.isFinite(input.amountPaid) || input.amountPaid <= 0) throw new Error("Nominal dibayar harus lebih dari 0.");
  if (Number.isNaN(Date.parse(input.paymentDate))) throw new Error("Tanggal pembayaran tidak valid.");
  if (isProductionMode()) {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await tx.tempoReceivable.findUnique({ where: { id } });
      if (!row) throw new Error("Tempo tidak ditemukan.");
      const before = toTempoReceivable(row);
      if (finalStatuses.includes(before.status)) throw new Error("Tempo final tidak bisa dibayar lagi.");
      const rekenings = await rekeningForTipe(before.tipeId);
      const rekening = rekenings.find((item) => item.id === input.rekeningId);
      if (!rekening) throw new Error("Rekening penerima tidak tersedia untuk tipe Tempo ini.");
      if (input.amountPaid > before.remainingAmount) throw new Error("Nominal dibayar tidak boleh lebih dari sisa Tempo.");
      const now = new Date();
      const updated = await tx.tempoReceivable.updateMany({
        where: { id, remainingAmount: { gte: input.amountPaid } },
        data: {
          paidAmount: { increment: input.amountPaid },
          remainingAmount: { decrement: input.amountPaid },
          updatedAt: now
        }
      });
      if (updated.count !== 1) throw new Error("Nominal dibayar tidak boleh lebih dari sisa Tempo.");
      const payment = await tx.tempoPayment.create({
        data: {
          id: `TPY-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          tempoReceivableId: id,
          paymentDate: new Date(input.paymentDate),
          amountPaid: input.amountPaid,
          paymentMethod: input.paymentMethod,
          rekeningId: rekening.id,
          rekeningNameSnapshot: rekening.name,
          attachmentUrl: input.attachmentUrl,
          notes: input.notes,
          erpPaymentStatus: "not_required",
          createdByUserId: user.id,
          createdByNameSnapshot: user.name,
          createdAt: now
        }
      });
      const latest = await tx.tempoReceivable.findUniqueOrThrow({ where: { id } });
      const remainingAmount = Number(latest.remainingAmount);
      const afterRow = await tx.tempoReceivable.update({
        where: { id },
        data: { status: remainingAmount <= 0 ? "paid" : "partial_paid" }
      });
      const after = toTempoReceivable(afterRow);
      const paymentResult = toTempoPayment(payment);
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          entityType: "tempo",
          entityId: id,
          action: after.status === "paid" ? "mark_paid" : "partial_paid",
          beforeValue: serializeJson(before),
          afterValue: serializeJson({ receivable: after, payment: paymentResult }),
          userId: user.id,
          userNameSnapshot: user.name,
          userRoleSnapshot: user.role,
          reason: `Pembayaran Tempo ${input.paymentMethod}`
        }
      });
      return { receivable: after, payment: paymentResult };
    });
    const syncedPayment = await syncTempoPaymentToErp(result.receivable, result.payment);
    return { receivable: result.receivable, payment: syncedPayment };
  }
  const rows = await readJsonArray<TempoReceivable>(receivableFile);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error("Tempo tidak ditemukan.");
  const before = rows[index];
  if (finalStatuses.includes(before.status)) throw new Error("Tempo final tidak bisa dibayar lagi.");
  const rekenings = await rekeningForTipe(before.tipeId);
  const rekening = rekenings.find((item) => item.id === input.rekeningId);
  if (!rekening) throw new Error("Rekening penerima tidak tersedia untuk tipe Tempo ini.");
  if (input.amountPaid > before.remainingAmount) throw new Error("Nominal dibayar tidak boleh lebih dari sisa Tempo.");
  const now = new Date().toISOString();
  const paidAmount = before.paidAmount + input.amountPaid;
  const remainingAmount = before.originalAmount - paidAmount;
  const after: TempoReceivable = { ...before, paidAmount, remainingAmount, status: remainingAmount <= 0 ? "paid" : "partial_paid", updatedAt: now };
  rows[index] = after;
  await writeJsonArray(receivableFile, rows);
  const payment: TempoPayment = { id: `TPY-${Date.now()}`, tempoReceivableId: id, createdByUserId: user.id, createdByNameSnapshot: user.name, createdAt: now, erpPaymentStatus: "not_required", ...input, rekeningId: rekening.id, rekeningNameSnapshot: rekening.name };
  const payments = await readJsonArray<TempoPayment>(paymentFile);
  payments.unshift(payment);
  await writeJsonArray(paymentFile, payments);
  await recordAudit({ entityType: "tempo", entityId: id, action: after.status === "paid" ? "mark_paid" : "partial_paid", beforeValue: before, afterValue: { receivable: after, payment }, reason: `Pembayaran Tempo ${input.paymentMethod}` });
  return { receivable: after, payment };
}

export async function cancelTempo(id: string, reason: string): Promise<TempoReceivable> {
  const user = await getCurrentUser();
  if (!can(user.role, "tempo.cancel")) throw new Error("Tidak punya akses cancel Tempo.");
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("Alasan cancel wajib diisi.");
  if (isProductionMode()) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await tx.tempoReceivable.findUnique({ where: { id } });
      if (!row) throw new Error("Tempo tidak ditemukan.");
      const before = toTempoReceivable(row);
      if (!activeStatuses.includes(before.status)) throw new Error("Tempo final tidak bisa di-cancel.");
      const updated = await tx.tempoReceivable.update({ where: { id }, data: { status: "cancelled", updatedAt: new Date() } });
      const after = toTempoReceivable(updated);
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          entityType: "tempo",
          entityId: id,
          action: "cancel",
          beforeValue: serializeJson(before),
          afterValue: serializeJson(after),
          userId: user.id,
          userNameSnapshot: user.name,
          userRoleSnapshot: user.role,
          reason: cleanReason
        }
      });
      return after;
    });
  }
  const rows = await readJsonArray<TempoReceivable>(receivableFile);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error("Tempo tidak ditemukan.");
  const before = rows[index];
  if (!activeStatuses.includes(before.status)) throw new Error("Tempo final tidak bisa di-cancel.");
  const after: TempoReceivable = { ...before, status: "cancelled", updatedAt: new Date().toISOString() };
  rows[index] = after;
  await writeJsonArray(receivableFile, rows);
  await recordAudit({ entityType: "tempo", entityId: id, action: "cancel", beforeValue: before, afterValue: after, reason: cleanReason });
  return after;
}

export async function writeOffTempo(id: string, reason: string): Promise<TempoReceivable> {
  const user = await getCurrentUser();
  if (!can(user.role, "tempo.write_off")) throw new Error("Tidak punya akses write-off Tempo.");
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("Alasan write-off wajib diisi.");
  if (isProductionMode()) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await tx.tempoReceivable.findUnique({ where: { id } });
      if (!row) throw new Error("Tempo tidak ditemukan.");
      const before = toTempoReceivable(row);
      if (!activeStatuses.includes(before.status)) throw new Error("Tempo final tidak bisa di-write-off.");
      if (before.remainingAmount <= 0) throw new Error("Tempo tanpa sisa piutang tidak bisa di-write-off.");
      const updated = await tx.tempoReceivable.update({ where: { id }, data: { status: "written_off", updatedAt: new Date() } });
      const after = toTempoReceivable(updated);
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          entityType: "tempo",
          entityId: id,
          action: "write_off",
          beforeValue: serializeJson(before),
          afterValue: serializeJson({ receivable: after, writtenOffAmount: before.remainingAmount }),
          userId: user.id,
          userNameSnapshot: user.name,
          userRoleSnapshot: user.role,
          reason: cleanReason
        }
      });
      return after;
    });
  }
  const rows = await readJsonArray<TempoReceivable>(receivableFile);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error("Tempo tidak ditemukan.");
  const before = rows[index];
  if (!activeStatuses.includes(before.status)) throw new Error("Tempo final tidak bisa di-write-off.");
  if (before.remainingAmount <= 0) throw new Error("Tempo tanpa sisa piutang tidak bisa di-write-off.");
  const after: TempoReceivable = { ...before, status: "written_off", updatedAt: new Date().toISOString() };
  rows[index] = after;
  await writeJsonArray(receivableFile, rows);
  await recordAudit({ entityType: "tempo", entityId: id, action: "write_off", beforeValue: before, afterValue: { receivable: after, writtenOffAmount: before.remainingAmount }, reason: cleanReason });
  return after;
}
