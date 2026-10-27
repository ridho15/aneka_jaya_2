import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { can, type Role } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/audit/store";
import { readJsonArray, writeJsonArray } from "@/lib/data/jsonStore";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { rekeningForTipe } from "@/lib/business/masterData";
import { syncErpSalesPayment } from "@/lib/api/salesPayments";
import { jakartaDateKey } from "@/lib/date/jakarta";
import { calculateTempoMetricsSummary, type TempoMetricsSummary } from "./summary";
import { postTempoPaymentJournal, reverseTempoPaymentJournal } from "./postingHooks";

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

export type TempoPaymentReversal = {
  id: string;
  tempoPaymentId: string;
  reversalDate: string;
  amount: number;
  reason: string;
  erpStatus: string;
  erpReference?: string;
  createdByUserId: string;
  createdByNameSnapshot: string;
  createdAt: string;
};

export type InitialTempoPaymentInput = {
  amount: number;
  method?: TempoPayment["paymentMethod"];
  rekeningId?: string;
  rekeningNameSnapshot?: string;
  notes?: string;
};

export type TempoCreationInput = Omit<TempoReceivable, "id" | "paidAmount" | "remainingAmount" | "status" | "createdByUserId" | "createdByNameSnapshot" | "createdAt" | "updatedAt"> & {
  initialPayment?: InitialTempoPaymentInput;
};

const receivableFile = "tempo-receivables.json";
const paymentFile = "tempo-payments.json";
const reversalFile = "tempo-payment-reversals.json";
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
  return jakartaDateKey();
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
    originalAmount: Number(row.originalAmount || 0),
    paidAmount: Number(row.paidAmount || 0),
    remainingAmount: Number(row.remainingAmount || 0),
    transactionDate: row.transactionDate ? jakartaDateKey(row.transactionDate) : jakartaDateKey(new Date()),
    dueDate: row.dueDate ? jakartaDateKey(row.dueDate) : jakartaDateKey(new Date()),
    status: (row.status || "open") as TempoStatus,
    createdByUserId: row.createdByUserId || "",
    createdByNameSnapshot: row.createdByNameSnapshot || "",
    createdAt: row.createdAt ? (row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString()) : new Date().toISOString(),
    updatedAt: row.updatedAt ? (row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(row.updatedAt).toISOString()) : new Date().toISOString()
  };
}

function toTempoPayment(row: Awaited<ReturnType<typeof prisma.tempoPayment.findMany>>[number]): TempoPayment {
  return {
    id: row.id,
    tempoReceivableId: row.tempoReceivableId,
    paymentDate: row.paymentDate ? jakartaDateKey(row.paymentDate) : jakartaDateKey(new Date()),
    amountPaid: Number(row.amountPaid || 0),
    paymentMethod: (row.paymentMethod || "Cash") as TempoPayment["paymentMethod"],
    rekeningId: row.rekeningId,
    rekeningNameSnapshot: row.rekeningNameSnapshot,
    attachmentUrl: row.attachmentUrl || undefined,
    notes: row.notes || undefined,
    erpPaymentStatus: row.erpPaymentStatus as TempoPayment["erpPaymentStatus"],
    erpPaymentError: row.erpPaymentError || undefined,
    erpPaymentReference: row.erpPaymentReference || undefined,
    erpPaymentSyncedAt: row.erpPaymentSyncedAt ? (row.erpPaymentSyncedAt instanceof Date ? row.erpPaymentSyncedAt.toISOString() : new Date(row.erpPaymentSyncedAt).toISOString()) : undefined,
    erpPaymentAttemptedAt: row.erpPaymentAttemptedAt ? (row.erpPaymentAttemptedAt instanceof Date ? row.erpPaymentAttemptedAt.toISOString() : new Date(row.erpPaymentAttemptedAt).toISOString()) : undefined,
    createdByUserId: row.createdByUserId || "",
    createdByNameSnapshot: row.createdByNameSnapshot || "",
    createdAt: row.createdAt ? (row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString()) : new Date().toISOString()
  };
}

function toTempoPaymentReversal(row: Awaited<ReturnType<typeof prisma.tempoPaymentReversal.findMany>>[number]): TempoPaymentReversal {
  return {
    id: row.id,
    tempoPaymentId: row.tempoPaymentId,
    reversalDate: jakartaDateKey(row.reversalDate),
    amount: Number(row.amount),
    reason: row.reason,
    erpStatus: row.erpStatus,
    erpReference: row.erpReference || undefined,
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdAt: row.createdAt.toISOString()
  };
}

async function listPrismaTempoSafe() {
  return prisma.tempoReceivable.findMany({ orderBy: { createdAt: "desc" } }).then((rows) => rows.map(toTempoReceivable)).catch(() => []);
}

async function listPrismaTempoPaymentsSafe() {
  return prisma.tempoPayment.findMany({ orderBy: { createdAt: "desc" } }).then((rows) => rows.map(toTempoPayment)).catch(() => []);
}

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]) {
  const rows = new Map<string, T>();
  for (const row of [...secondary, ...primary]) rows.set(row.id, row);
  return Array.from(rows.values());
}

async function prismaTempoExists(id: string) {
  return prisma.tempoReceivable.findUnique({ where: { id }, select: { id: true } }).then(Boolean).catch(() => false);
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

export async function syncInitialTempoPaymentForSale(salesId: string): Promise<TempoPayment | undefined> {
  if (!isProductionMode()) return undefined;
  const receivableRow = await prisma.tempoReceivable.findUnique({ where: { salesId } });
  if (!receivableRow) return undefined;
  const paymentRow = await prisma.tempoPayment.findUnique({ where: { id: `TPY-INITIAL-${salesId}` } });
  if (!paymentRow) return undefined;
  return syncTempoPaymentToErp(toTempoReceivable(receivableRow), toTempoPayment(paymentRow));
}

export async function createTempoReceivableInTransaction(tx: Prisma.TransactionClient, input: TempoCreationInput, user: { id: string; name: string; role: Role }): Promise<{ receivable: TempoReceivable; payment?: TempoPayment }> {
  const existing = await tx.tempoReceivable.findUnique({ where: { salesId: input.salesId } });
  if (existing) {
    const payment = typeof tx.tempoPayment.findUnique === "function" ? await tx.tempoPayment.findUnique({ where: { id: `TPY-INITIAL-${input.salesId}` } }) : null;
    return { receivable: existing as unknown as TempoReceivable, payment: payment ? toTempoPayment(payment) : undefined };
  }
  const initialAmount = Math.max(0, Number(input.initialPayment?.amount || 0));
  const now = new Date();
  const receivableId = `TMP-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const created = await tx.tempoReceivable.create({
    data: {
      id: receivableId,
      salesId: input.salesId,
      tipeId: input.tipeId,
      tipeCodeSnapshot: input.tipeCodeSnapshot,
      tipeNameSnapshot: input.tipeNameSnapshot,
      customerName: input.customerName,
      originalAmount: input.originalAmount,
      paidAmount: initialAmount,
      remainingAmount: input.originalAmount - initialAmount,
      transactionDate: new Date(input.transactionDate),
      dueDate: new Date(input.dueDate),
      status: initialAmount > 0 ? "partial_paid" : "open",
      createdByUserId: user.id,
      createdByNameSnapshot: user.name,
      createdAt: now,
      updatedAt: now
    }
  });
  let payment: TempoPayment | undefined;
  if (initialAmount > 0 && input.initialPayment?.method && input.initialPayment.rekeningId) {
    const sale = await tx.salesRecord.findUnique({ where: { id: input.salesId }, select: { syncTarget: true } });
    const initialErpStatus = sale?.syncTarget === "erp" ? "pending" : "not_required";
    const paymentRow = await tx.tempoPayment.create({
      data: {
        id: `TPY-INITIAL-${input.salesId}`,
        tempoReceivableId: receivableId,
        paymentDate: new Date(input.transactionDate),
        amountPaid: initialAmount,
        paymentMethod: input.initialPayment.method,
        rekeningId: input.initialPayment.rekeningId,
        rekeningNameSnapshot: input.initialPayment.rekeningNameSnapshot || input.initialPayment.rekeningId,
        notes: input.initialPayment.notes,
        erpPaymentStatus: initialErpStatus,
        createdByUserId: user.id,
        createdByNameSnapshot: user.name,
        createdAt: now
      }
    });
    if (sale?.syncTarget === "erp") await tx.salesRecord.update({ where: { id: input.salesId }, data: { erpPaymentStatus: "pending", erpPaymentError: "Pembayaran awal Tempo menunggu sinkronisasi ERP." } });
    payment = toTempoPayment(paymentRow);
  }
  const receivable: TempoReceivable = created ? toTempoReceivable(created) : {
    id: receivableId, salesId: input.salesId, tipeId: input.tipeId, tipeCodeSnapshot: input.tipeCodeSnapshot,
    tipeNameSnapshot: input.tipeNameSnapshot, customerName: input.customerName, originalAmount: input.originalAmount,
    paidAmount: initialAmount, remainingAmount: input.originalAmount - initialAmount, transactionDate: input.transactionDate,
    dueDate: input.dueDate, status: initialAmount > 0 ? "partial_paid" : "open", createdByUserId: user.id,
    createdByNameSnapshot: user.name, createdAt: now.toISOString(), updatedAt: now.toISOString()
  };
  await tx.auditLog.create({ data: { id: crypto.randomUUID(), entityType: "tempo", entityId: receivableId, action: initialAmount > 0 ? "partial_paid" : "create", afterValue: serializeJson({ receivable, payment }), userId: user.id, userNameSnapshot: user.name, userRoleSnapshot: user.role, reason: initialAmount > 0 ? "Tempo dan pembayaran awal dibuat dari Input Penjualan" : "Tempo dibuat dari Input Penjualan" } });
  return { receivable, payment };
}

export async function createTempoReceivable(input: TempoCreationInput): Promise<TempoReceivable> {
  const user = await getCurrentUser();
  const now = new Date().toISOString();
  const initialAmount = Math.max(0, Number(input.initialPayment?.amount || 0));
  const receivable: TempoReceivable = {
    id: `TMP-${Date.now()}`,
    paidAmount: initialAmount,
    remainingAmount: input.originalAmount - initialAmount,
    status: initialAmount > 0 ? "partial_paid" : "open",
    createdByUserId: user.id,
    createdByNameSnapshot: user.name,
    createdAt: now,
    updatedAt: now,
    salesId: input.salesId,
    tipeId: input.tipeId,
    tipeCodeSnapshot: input.tipeCodeSnapshot,
    tipeNameSnapshot: input.tipeNameSnapshot,
    customerName: input.customerName,
    originalAmount: input.originalAmount,
    transactionDate: input.transactionDate,
    dueDate: input.dueDate
  };
  if (isProductionMode()) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => (await createTempoReceivableInTransaction(tx, input, user)).receivable);
  }
  const rows = await readJsonArray<TempoReceivable>(receivableFile);
  rows.unshift(receivable);
  await writeJsonArray(receivableFile, rows);
  if (initialAmount > 0 && input.initialPayment?.method && input.initialPayment.rekeningId) {
    const payments = await readJsonArray<TempoPayment>(paymentFile);
    payments.unshift({ id: `TPY-INITIAL-${input.salesId}`, tempoReceivableId: receivable.id, paymentDate: input.transactionDate, amountPaid: initialAmount, paymentMethod: input.initialPayment.method, rekeningId: input.initialPayment.rekeningId, rekeningNameSnapshot: input.initialPayment.rekeningNameSnapshot || input.initialPayment.rekeningId, notes: input.initialPayment.notes, erpPaymentStatus: "not_required", createdByUserId: user.id, createdByNameSnapshot: user.name, createdAt: now });
    await writeJsonArray(paymentFile, payments);
  }
  await recordAudit({ entityType: "tempo", entityId: receivable.id, action: initialAmount > 0 ? "partial_paid" : "create", afterValue: receivable, reason: initialAmount > 0 ? "Tempo dan pembayaran awal dibuat dari Input Penjualan" : "Tempo dibuat dari Input Penjualan" });
  return receivable;
}

export type TempoSalesEditSyncInput = {
  salesId: string;
  tipeId: string;
  tipeCodeSnapshot: string;
  tipeNameSnapshot: string;
  customerName: string;
  total: number;
  saleDate: string;
  dueDate?: string | null;
  paymentMethod: string;
  initialPaymentAmount?: number | null;
  initialPaymentMethod?: TempoPayment["paymentMethod"];
  initialPaymentRekeningId?: string | null;
  initialPaymentRekeningNameSnapshot?: string | null;
  initialPaymentNotes?: string | null;
  syncTarget?: string;
};

export async function syncTempoReceivableOnSalesEditInTransaction(
  tx: Prisma.TransactionClient,
  input: TempoSalesEditSyncInput,
  user: { id: string; name: string; role: Role }
): Promise<{ receivable?: TempoReceivable; payment?: TempoPayment }> {
  const existing = await tx.tempoReceivable.findUnique({
    where: { salesId: input.salesId },
    include: { payments: true }
  });

  if (input.paymentMethod !== "Tempo") {
    if (existing && !finalStatuses.includes(existing.status as TempoStatus)) {
      await tx.tempoReceivable.update({
        where: { id: existing.id },
        data: { status: "cancelled", updatedAt: new Date() }
      });
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          entityType: "tempo",
          entityId: existing.id,
          action: "cancel",
          beforeValue: serializeJson(existing),
          afterValue: serializeJson({ status: "cancelled" }),
          userId: user.id,
          userNameSnapshot: user.name,
          userRoleSnapshot: user.role,
          reason: "Metode pembayaran diubah dari Tempo ke tunai/transfer pada edit penjualan"
        }
      });
    }
    return {};
  }

  const initialAmount = Math.max(0, Number(input.initialPaymentAmount || 0));
  const now = new Date();

  if (!existing) {
    return createTempoReceivableInTransaction(
      tx,
      {
        salesId: input.salesId,
        tipeId: input.tipeId,
        tipeCodeSnapshot: input.tipeCodeSnapshot,
        tipeNameSnapshot: input.tipeNameSnapshot,
        customerName: input.customerName,
        originalAmount: input.total,
        transactionDate: input.saleDate,
        dueDate: input.dueDate || input.saleDate,
        initialPayment: initialAmount > 0 && input.initialPaymentMethod && input.initialPaymentRekeningId ? {
          amount: initialAmount,
          method: input.initialPaymentMethod,
          rekeningId: input.initialPaymentRekeningId,
          rekeningNameSnapshot: input.initialPaymentRekeningNameSnapshot || input.initialPaymentRekeningId,
          notes: input.initialPaymentNotes || undefined
        } : undefined
      },
      user
    );
  }

  const initialPaymentId = `TPY-INITIAL-${input.salesId}`;
  const otherPayments = (existing.payments || []).filter((p) => p.id !== initialPaymentId);
  const otherPaid = otherPayments.reduce((sum, p) => sum + Number(p.amountPaid), 0);
  const totalPaid = initialAmount + otherPaid;
  const remainingAmount = Math.max(0, input.total - totalPaid);
  const nextStatus: TempoStatus = remainingAmount <= 0 ? "paid" : totalPaid > 0 ? "partial_paid" : "open";

  const updatedReceivableRow = await tx.tempoReceivable.update({
    where: { id: existing.id },
    data: {
      customerName: input.customerName,
      originalAmount: input.total,
      paidAmount: totalPaid,
      remainingAmount,
      dueDate: input.dueDate ? new Date(input.dueDate) : existing.dueDate,
      status: nextStatus,
      updatedAt: now
    }
  });

  let payment: TempoPayment | undefined;
  if (initialAmount > 0 && input.initialPaymentMethod && input.initialPaymentRekeningId) {
    const sale = await tx.salesRecord.findUnique({ where: { id: input.salesId }, select: { syncTarget: true } });
    const initialErpStatus = sale?.syncTarget === "erp" ? "pending" : "not_required";
    const paymentRow = await tx.tempoPayment.upsert({
      where: { id: initialPaymentId },
      create: {
        id: initialPaymentId,
        tempoReceivableId: existing.id,
        paymentDate: new Date(input.saleDate),
        amountPaid: initialAmount,
        paymentMethod: input.initialPaymentMethod,
        rekeningId: input.initialPaymentRekeningId,
        rekeningNameSnapshot: input.initialPaymentRekeningNameSnapshot || input.initialPaymentRekeningId,
        notes: input.initialPaymentNotes || undefined,
        erpPaymentStatus: initialErpStatus,
        createdByUserId: user.id,
        createdByNameSnapshot: user.name,
        createdAt: now
      },
      update: {
        paymentDate: new Date(input.saleDate),
        amountPaid: initialAmount,
        paymentMethod: input.initialPaymentMethod,
        rekeningId: input.initialPaymentRekeningId,
        rekeningNameSnapshot: input.initialPaymentRekeningNameSnapshot || input.initialPaymentRekeningId,
        notes: input.initialPaymentNotes || undefined,
        erpPaymentStatus: initialErpStatus
      }
    });
    payment = toTempoPayment(paymentRow);
  } else {
    await tx.tempoPayment.deleteMany({ where: { id: initialPaymentId } });
  }

  const receivable = toTempoReceivable(updatedReceivableRow);
  await tx.auditLog.create({
    data: {
      id: crypto.randomUUID(),
      entityType: "tempo",
      entityId: existing.id,
      action: "update",
      beforeValue: serializeJson(existing),
      afterValue: serializeJson({ receivable, payment }),
      userId: user.id,
      userNameSnapshot: user.name,
      userRoleSnapshot: user.role,
      reason: "Pembayaran awal / data Tempo diperbarui dari Edit Penjualan"
    }
  });

  return { receivable, payment };
}

export async function syncTempoReceivableOnSalesEdit(
  input: TempoSalesEditSyncInput,
  user: { id: string; name: string; role: Role }
): Promise<{ receivable?: TempoReceivable; payment?: TempoPayment }> {
  if (isProductionMode()) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) =>
      syncTempoReceivableOnSalesEditInTransaction(tx, input, user)
    );
  }

  const rows = await readJsonArray<TempoReceivable>(receivableFile);
  const index = rows.findIndex((r) => r.salesId === input.salesId);
  const initialAmount = Math.max(0, Number(input.initialPaymentAmount || 0));
  const now = new Date().toISOString();
  const initialPaymentId = `TPY-INITIAL-${input.salesId}`;

  if (input.paymentMethod !== "Tempo") {
    if (index >= 0 && !finalStatuses.includes(rows[index].status)) {
      const before = rows[index];
      rows[index] = { ...before, status: "cancelled", updatedAt: now };
      await writeJsonArray(receivableFile, rows);
      await recordAudit({
        entityType: "tempo",
        entityId: before.id,
        action: "cancel",
        beforeValue: before,
        afterValue: rows[index],
        reason: "Metode pembayaran diubah dari Tempo ke tunai/transfer pada edit penjualan"
      });
    }
    return {};
  }

  if (index < 0) {
    const created = await createTempoReceivable({
      salesId: input.salesId,
      tipeId: input.tipeId,
      tipeCodeSnapshot: input.tipeCodeSnapshot,
      tipeNameSnapshot: input.tipeNameSnapshot,
      customerName: input.customerName,
      originalAmount: input.total,
      transactionDate: input.saleDate,
      dueDate: input.dueDate || input.saleDate,
      initialPayment: initialAmount > 0 && input.initialPaymentMethod && input.initialPaymentRekeningId ? {
        amount: initialAmount,
        method: input.initialPaymentMethod,
        rekeningId: input.initialPaymentRekeningId,
        rekeningNameSnapshot: input.initialPaymentRekeningNameSnapshot || input.initialPaymentRekeningId,
        notes: input.initialPaymentNotes || undefined
      } : undefined
    });
    return { receivable: created };
  }

  const before = rows[index];
  const payments = await readJsonArray<TempoPayment>(paymentFile);
  const otherPayments = payments.filter((p) => p.tempoReceivableId === before.id && p.id !== initialPaymentId);
  const otherPaid = otherPayments.reduce((sum, p) => sum + Number(p.amountPaid), 0);
  const totalPaid = initialAmount + otherPaid;
  const remainingAmount = Math.max(0, input.total - totalPaid);
  const nextStatus: TempoStatus = remainingAmount <= 0 ? "paid" : totalPaid > 0 ? "partial_paid" : "open";

  const after: TempoReceivable = {
    ...before,
    customerName: input.customerName,
    originalAmount: input.total,
    paidAmount: totalPaid,
    remainingAmount,
    dueDate: input.dueDate || before.dueDate,
    status: nextStatus,
    updatedAt: now
  };
  rows[index] = after;
  await writeJsonArray(receivableFile, rows);

  let payment: TempoPayment | undefined;
  const remainingPayments = payments.filter((p) => p.id !== initialPaymentId);
  if (initialAmount > 0 && input.initialPaymentMethod && input.initialPaymentRekeningId) {
    payment = {
      id: initialPaymentId,
      tempoReceivableId: before.id,
      paymentDate: input.saleDate,
      amountPaid: initialAmount,
      paymentMethod: input.initialPaymentMethod,
      rekeningId: input.initialPaymentRekeningId,
      rekeningNameSnapshot: input.initialPaymentRekeningNameSnapshot || input.initialPaymentRekeningId,
      notes: input.initialPaymentNotes || undefined,
      erpPaymentStatus: "not_required",
      createdByUserId: user.id,
      createdByNameSnapshot: user.name,
      createdAt: now
    };
    remainingPayments.unshift(payment);
  }
  await writeJsonArray(paymentFile, remainingPayments);
  await recordAudit({
    entityType: "tempo",
    entityId: before.id,
    action: "update",
    beforeValue: before,
    afterValue: { receivable: after, payment },
    reason: "Pembayaran awal / data Tempo diperbarui dari Edit Penjualan"
  });

  return { receivable: after, payment };
}

export async function listTempoReceivables(): Promise<TempoReceivable[]> {
  if (isProductionMode()) {
    const rows = await prisma.tempoReceivable.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toTempoReceivable).map(applyOverdueStatus);
  }
  const rows = mergeById(await listPrismaTempoSafe(), await readJsonArray<TempoReceivable>(receivableFile));
  const bySalesId = new Map<string, TempoReceivable>();
  for (const row of rows) if (!bySalesId.has(row.salesId)) bySalesId.set(row.salesId, row);
  return Array.from(bySalesId.values()).map(applyOverdueStatus).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  const filtered = filterTempoInMemory(await listTempoReceivables(), input.filters || {});
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
  return Array.from(new Set((await listTempoReceivables()).map((row) => row.tipeCodeSnapshot || row.tipeId).filter(Boolean))).sort();
}

export async function getTempoReceivable(id: string): Promise<TempoReceivable | undefined> {
  if (isProductionMode()) {
    const row = await prisma.tempoReceivable.findUnique({ where: { id } });
    if (!row) return undefined;
    const receivable = toTempoReceivable(row);
    const today = todayDateString();
    return receivable.status === "open" && receivable.dueDate < today ? { ...receivable, status: "overdue" as TempoStatus } : receivable;
  }
  const dbRow = await prisma.tempoReceivable.findUnique({ where: { id } }).catch(() => null);
  if (dbRow) return applyOverdueStatus(toTempoReceivable(dbRow));
  return (await readJsonArray<TempoReceivable>(receivableFile)).find((row) => row.id === id);
}

export async function listTempoPayments(tempoReceivableId?: string): Promise<TempoPayment[]> {
  if (isProductionMode()) {
    const rows = await prisma.tempoPayment.findMany({
      where: tempoReceivableId ? { tempoReceivableId } : undefined,
      orderBy: { createdAt: "desc" }
    });
    return rows.map(toTempoPayment);
  }
  const rows = mergeById(await listPrismaTempoPaymentsSafe(), await readJsonArray<TempoPayment>(paymentFile)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return tempoReceivableId ? rows.filter((row) => row.tempoReceivableId === tempoReceivableId) : rows;
}

export async function listTempoPaymentReversals(tempoPaymentId?: string): Promise<TempoPaymentReversal[]> {
  const dbRows = await prisma.tempoPaymentReversal.findMany({ where: tempoPaymentId ? { tempoPaymentId } : undefined, orderBy: { createdAt: "desc" } }).then((rows) => rows.map(toTempoPaymentReversal)).catch(() => []);
  if (isProductionMode()) return dbRows;
  const rows = mergeById(dbRows, await readJsonArray<TempoPaymentReversal>(reversalFile)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return tempoPaymentId ? rows.filter((row) => row.tempoPaymentId === tempoPaymentId) : rows;
}

export async function payTempo(id: string, input: Omit<TempoPayment, "id" | "tempoReceivableId" | "createdByUserId" | "createdByNameSnapshot" | "createdAt">): Promise<{ receivable: TempoReceivable; payment: TempoPayment }> {
  const user = await getCurrentUser();
  if (!can(user.role, "tempo.mark_paid")) throw new Error("Tidak punya akses bayar Tempo.");
  if (!Number.isFinite(input.amountPaid) || input.amountPaid <= 0) throw new Error("Nominal dibayar harus lebih dari 0.");
  if (Number.isNaN(Date.parse(input.paymentDate))) throw new Error("Tanggal pembayaran tidak valid.");
  if (isProductionMode() || await prismaTempoExists(id)) {
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
    }, { maxWait: 15000, timeout: 30000 });
    const syncedPayment = await syncTempoPaymentToErp(result.receivable, result.payment);
    const finalPayment = syncedPayment || result.payment;
    try {
      await postTempoPaymentJournal(finalPayment, {
        id: user.id,
        name: user.name,
        role: user.role
      });
    } catch (journalErr) {
      console.error("[payTempo] Gagal mem-posting jurnal pelunasan tempo:", journalErr);
    }
    return { receivable: result.receivable, payment: finalPayment };
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
  try {
    await postTempoPaymentJournal(payment, {
      id: user.id,
      name: user.name,
      role: user.role
    });
  } catch (journalErr) {
    console.error("[payTempo JSON] Gagal mem-posting jurnal pelunasan tempo:", journalErr);
  }
  return { receivable: after, payment };
}

export async function reverseTempoPayment(
  paymentId: string,
  reason: string
): Promise<{ payment: TempoPayment; reversal: TempoPaymentReversal }> {
  const user = await getCurrentUser();
  if (!can(user.role, "tempo.mark_paid") && !can(user.role, "penjualan.manage")) {
    throw new Error("Tidak punya akses membatalkan pembayaran Tempo.");
  }
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("Alasan pembatalan pembayaran wajib diisi.");

  const pRow = await prisma.tempoPayment.findUnique({ where: { id: paymentId } });
  if (isProductionMode() || pRow) {
    const { payment, reversal } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const p = await tx.tempoPayment.findUnique({ where: { id: paymentId } });
      if (!p) throw new Error("Pembayaran Tempo tidak ditemukan.");
      const receivable = await tx.tempoReceivable.findUnique({ where: { id: p.tempoReceivableId } });
      if (!receivable) throw new Error("Piutang Tempo tidak ditemukan.");

      const amount = Number(p.amountPaid);
      const newPaid = Math.max(0, Number(receivable.paidAmount) - amount);
      const newRemaining = Number(receivable.remainingAmount) + amount;
      const newStatus: TempoStatus = newPaid <= 0 ? "open" : "partial_paid";

      await tx.tempoReceivable.update({
        where: { id: receivable.id },
        data: {
          paidAmount: newPaid,
          remainingAmount: newRemaining,
          status: newStatus,
          updatedAt: new Date()
        }
      });

      const revRecord = await tx.tempoPaymentReversal.create({
        data: {
          id: `TPR-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          tempoPaymentId: paymentId,
          reversalDate: new Date(),
          amount: amount,
          reason: cleanReason,
          erpStatus: "pending",
          createdByUserId: user.id,
          createdByNameSnapshot: user.name,
          createdAt: new Date()
        }
      });

      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          entityType: "tempo",
          entityId: receivable.id,
          action: "reversal",
          beforeValue: serializeJson({ receivable, payment: p }),
          afterValue: serializeJson({ newPaid, newRemaining, newStatus, reversal: revRecord }),
          userId: user.id,
          userNameSnapshot: user.name,
          userRoleSnapshot: user.role,
          reason: cleanReason
        }
      });

      return { payment: toTempoPayment(p), reversal: toTempoPaymentReversal(revRecord) };
    }, { maxWait: 15000, timeout: 30000 });

    try {
      await reverseTempoPaymentJournal(payment.id, {
        id: user.id,
        name: user.name,
        role: user.role
      }, cleanReason);
    } catch (journalErr) {
      console.error("[reverseTempoPayment] Gagal reverse jurnal:", journalErr);
    }

    return { payment, reversal };
  }

  // JSON fallback
  const payments = await readJsonArray<TempoPayment>(paymentFile);
  const pIndex = payments.findIndex((p) => p.id === paymentId);
  if (pIndex < 0) throw new Error("Pembayaran Tempo tidak ditemukan.");
  const p = payments[pIndex];

  const receivables = await readJsonArray<TempoReceivable>(receivableFile);
  const rIndex = receivables.findIndex((r) => r.id === p.tempoReceivableId);
  if (rIndex >= 0) {
    const r = receivables[rIndex];
    const amount = Number(p.amountPaid);
    const newPaid = Math.max(0, r.paidAmount - amount);
    const newRemaining = r.remainingAmount + amount;
    const newStatus: TempoStatus = newPaid <= 0 ? "open" : "partial_paid";
    receivables[rIndex] = { ...r, paidAmount: newPaid, remainingAmount: newRemaining, status: newStatus, updatedAt: new Date().toISOString() };
    await writeJsonArray(receivableFile, receivables);
  }

  const reversal: TempoPaymentReversal = {
    id: `TPR-${Date.now()}`,
    tempoPaymentId: paymentId,
    reversalDate: jakartaDateKey(new Date()),
    amount: Number(p.amountPaid),
    reason: cleanReason,
    erpStatus: "pending",
    createdByUserId: user.id,
    createdByNameSnapshot: user.name,
    createdAt: new Date().toISOString()
  };

  const reversals = await readJsonArray<TempoPaymentReversal>(reversalFile);
  reversals.unshift(reversal);
  await writeJsonArray(reversalFile, reversals);

  try {
    await reverseTempoPaymentJournal(paymentId, {
      id: user.id,
      name: user.name,
      role: user.role
    }, cleanReason);
  } catch (journalErr) {
    console.error("[reverseTempoPayment JSON] Gagal reverse jurnal:", journalErr);
  }

  return { payment: p, reversal };
}

export async function applySalesReturnToTempo(
  salesRecordId: string,
  returnAmount: number,
  actor: { id: string; name: string; role: Role }
): Promise<TempoReceivable | null> {
  if (isProductionMode() || (typeof prisma?.tempoReceivable?.findFirst === "function")) {
    const row = await prisma.tempoReceivable.findFirst({
      where: { salesId: salesRecordId }
    });
    if (!row) return null;

    const before = toTempoReceivable(row);
    if (finalStatuses.includes(before.status) && before.status !== "paid") return null;

    const newRemaining = Math.max(0, before.remainingAmount - returnAmount);
    const newStatus: TempoStatus = newRemaining <= 0 ? "paid" : (before.paidAmount > 0 ? "partial_paid" : "open");

    const updated = await prisma.tempoReceivable.update({
      where: { id: row.id },
      data: {
        remainingAmount: newRemaining,
        status: newStatus,
        updatedAt: new Date()
      }
    });

    const after = toTempoReceivable(updated);

    await prisma.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        entityType: "tempo",
        entityId: row.id,
        action: "return_reduction",
        beforeValue: serializeJson(before),
        afterValue: serializeJson(after),
        userId: actor.id,
        userNameSnapshot: actor.name,
        userRoleSnapshot: actor.role,
        reason: `Pengurangan piutang akibat retur penjualan Rp ${returnAmount.toLocaleString("id-ID")}`
      }
    }).catch(() => null);

    return after;
  }

  // JSON fallback
  const rows = await readJsonArray<TempoReceivable>(receivableFile);
  const index = rows.findIndex((r) => r.salesId === salesRecordId);
  if (index < 0) return null;
  const before = rows[index];
  const newRemaining = Math.max(0, before.remainingAmount - returnAmount);
  const newStatus: TempoStatus = newRemaining <= 0 ? "paid" : (before.paidAmount > 0 ? "partial_paid" : "open");
  const after: TempoReceivable = { ...before, remainingAmount: newRemaining, status: newStatus, updatedAt: new Date().toISOString() };
  rows[index] = after;
  await writeJsonArray(receivableFile, rows);
  return after;
}

export async function cancelTempo(id: string, reason: string): Promise<TempoReceivable> {
  const user = await getCurrentUser();
  if (!can(user.role, "tempo.cancel")) throw new Error("Tidak punya akses cancel Tempo.");
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("Alasan cancel wajib diisi.");
  if (isProductionMode() || await prismaTempoExists(id)) {
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
  if (isProductionMode() || await prismaTempoExists(id)) {
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

export async function getTempoMetricsSummary(filters: TempoReceivableFilters = {}): Promise<TempoMetricsSummary> {
  const todayKey = todayDateString();
  if (isProductionMode()) {
    const where: Prisma.TempoReceivableWhereInput = {
      status: { notIn: finalStatuses }
    };
    if (filters.tipe) {
      where.OR = [{ tipeCodeSnapshot: filters.tipe }, { tipeId: filters.tipe }];
    }
    const rows = await prisma.tempoReceivable.findMany({
      where,
      select: {
        id: true,
        status: true,
        dueDate: true,
        remainingAmount: true
      }
    });
    return calculateTempoMetricsSummary(
      rows.map((r) => ({ ...r, remainingAmount: Number(r.remainingAmount) || 0 })),
      todayKey
    );
  }

  const all = await listTempoReceivables();
  const relevantRows = filters.tipe
    ? all.filter((r) => (r.tipeCodeSnapshot || r.tipeId) === filters.tipe)
    : all;
  return calculateTempoMetricsSummary(relevantRows, todayKey);
}

