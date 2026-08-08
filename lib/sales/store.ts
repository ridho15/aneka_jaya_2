import "server-only";
import { readJsonArray, writeJsonArray } from "@/lib/data/jsonStore";
import type { Sale } from "@/lib/types/sales";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/auth/roles";
import type { Prisma } from "@prisma/client";
import type { PenjualanInput } from "@/lib/validation/penjualanSchema";
import { recordAudit } from "@/lib/audit/store";
import { findTipe, listAllRekeningAccounts, resolveSalesRekening, type BookkeepingType, type RekeningAccount } from "@/lib/business/masterData";
import { getCurrentUser } from "@/lib/auth/session";
import { cancelErpSales, type SalesCancellationResult } from "@/lib/api/salesCancellations";
import { jakartaDateKey, jakartaTimestampFromLocal, transactionDateKey, transactionNumberFor } from "@/lib/date/jakarta";
import { createTempoReceivableInTransaction, type TempoCreationInput } from "@/lib/tempo/store";

const fileName = "sales-records.json";
const isProductionMode = () => process.env.NEXT_PUBLIC_APP_MODE === "production";
const salesInclude = { items: { orderBy: { sortOrder: "asc" as const } } };

export async function allocateTransactionIdentity(tx: Prisma.TransactionClient, transactionAt: string) {
  const dateKey = transactionDateKey(transactionAt);
  const counter = await tx.dailyTransactionCounter.upsert({
    where: { dateKey },
    create: { dateKey, lastValue: 1 },
    update: { lastValue: { increment: 1 } }
  });
  return {
    transactionAt,
    transactionDateKey: dateKey,
    transactionSequence: counter.lastValue,
    transactionNumber: transactionNumberFor(dateKey, counter.lastValue)
  };
}

function nextJsonTransactionIdentity(rows: Sale[], transactionAt: string) {
  const dateKey = transactionDateKey(transactionAt);
  const lastValue = rows.reduce((max, row) => row.transactionDateKey === dateKey ? Math.max(max, row.transactionSequence || 0) : max, 0);
  const transactionSequence = lastValue + 1;
  return { transactionAt, transactionDateKey: dateKey, transactionSequence, transactionNumber: transactionNumberFor(dateKey, transactionSequence) };
}

function serializeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function rekeningSnapshotForUpdate(before: Sale, rekening: RekeningAccount | undefined) {
  if (!rekening) return undefined;
  return before.rekeningId === rekening.id && before.rekeningNameSnapshot
    ? before.rekeningNameSnapshot
    : rekening.name;
}

async function resolveRekeningForUpdate(before: Sale, input: PenjualanInput, tipe: BookkeepingType) {
  const keepsHistoricalRekening =
    input.paymentMethod === before.paymentMethod
    && tipe.id === before.tipeId
    && Boolean(input.rekeningId)
    && input.rekeningId === before.rekeningId;
  if (keepsHistoricalRekening) {
    const rekening = (await listAllRekeningAccounts()).find((item) => item.id === input.rekeningId);
    if (rekening) return rekening;
    if (before.rekeningNameSnapshot) {
      return {
        id: before.rekeningId!,
        name: before.rekeningNameSnapshot,
        bank: before.rekeningNameSnapshot,
        accountNumber: "-",
        isActive: false,
        tipeIds: [tipe.id]
      } satisfies RekeningAccount;
    }
  }
  return resolveSalesRekening(input.paymentMethod, tipe.id, input.rekeningId);
}

type SalesRecordWithItems = Prisma.SalesRecordGetPayload<{ include: typeof salesInclude }>;
type LegacySalesRow = {
  id: string;
  saleDate: Date;
  tipeId: string;
  tipeCodeSnapshot: string;
  tipeNameSnapshot: string;
  customerName: string;
  customerLocation: string | null;
  shippingMethod: string | null;
  paymentMethod: string;
  dueDate: Date | null;
  rekeningId: string | null;
  transferAccount: string | null;
  notes: string | null;
  total: unknown;
  approvalStatus: string;
  syncTarget: string;
  syncStatus: string;
  syncError: string | null;
  syncAttemptedAt: Date | null;
  syncedAt: Date | null;
  erpReference: string | null;
  erpSyncHttpStatus?: number | null;
  erpSyncResponse?: unknown;
  stockReleaseStatus: string;
  stockReleaseError: string | null;
  stockReleaseReference: string | null;
  stockReleasedAt: Date | null;
  stockReleaseHttpStatus?: number | null;
  stockReleaseResponse?: unknown;
  testReference: string | null;
  isTestTransaction: boolean;
  createdByUserId: string;
  createdByNameSnapshot: string;
  createdByRoleSnapshot: Role;
  createdAt: Date;
};
type LegacySalesItemRow = {
  salesRecordId: string;
  productRef: string;
  productId: string | null;
  manualProduct: unknown;
  warehouseId: string | null;
  warehouseNameSnapshot: string | null;
  rackId: string | null;
  rackNameSnapshot: string | null;
  unitSnapshot: string | null;
  uomIdSnapshot: number | null;
  quantity: unknown;
  unitPrice: unknown;
  discount: unknown;
  sortOrder: number;
};
export type SalesRecordFilters = {
  from?: string;
  to?: string;
  keyword?: string;
  tipe?: string;
  paymentMethod?: string;
  rekening?: string;
  approvalStatus?: string;
  syncStatus?: string;
};
export type SalesRecordScope = {
  createdByUserId?: string;
};
export type PaginatedSalesRecords = {
  data: Sale[];
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

function isMissingColumnError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2022");
}

function appendSalesWhereAnd(where: Prisma.SalesRecordWhereInput, condition: Prisma.SalesRecordWhereInput) {
  where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), condition];
}

function buildSalesWhere(filters: SalesRecordFilters, scope: SalesRecordScope = {}): Prisma.SalesRecordWhereInput {
  const where: Prisma.SalesRecordWhereInput = {};
  if (scope.createdByUserId) where.createdByUserId = scope.createdByUserId;
  if (filters.from || filters.to) {
    where.saleDate = {};
    if (filters.from) where.saleDate.gte = dateStart(filters.from);
    if (filters.to) where.saleDate.lte = dateEnd(filters.to);
  }
  if (filters.tipe) where.OR = [{ tipeCodeSnapshot: filters.tipe }, { tipeId: filters.tipe }];
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.rekening) {
    appendSalesWhereAnd(where, {
      OR: [
        { rekeningId: filters.rekening },
        { rekeningNameSnapshot: filters.rekening },
        { transferAccount: filters.rekening }
      ]
    });
  }
  if (filters.approvalStatus) where.approvalStatus = filters.approvalStatus;
  if (filters.syncStatus) where.syncStatus = filters.syncStatus;
  const keyword = filters.keyword?.trim();
  if (keyword) {
    const keywordOr: Prisma.SalesRecordWhereInput[] = [
      { id: { contains: keyword, mode: "insensitive" } },
      { transactionNumber: { contains: keyword, mode: "insensitive" } },
      { customerName: { contains: keyword, mode: "insensitive" } },
      { customerLocation: { contains: keyword, mode: "insensitive" } },
      { testReference: { contains: keyword, mode: "insensitive" } },
      { erpReference: { contains: keyword, mode: "insensitive" } },
      { createdByNameSnapshot: { contains: keyword, mode: "insensitive" } }
    ];
    appendSalesWhereAnd(where, { OR: keywordOr });
  }
  return where;
}

export function filterSalesRecordsInMemory(sales: Sale[], filters: SalesRecordFilters, scope: SalesRecordScope = {}) {
  const keyword = filters.keyword?.trim().toLowerCase();
  return sales.filter((sale) => {
    if (scope.createdByUserId && sale.createdByUserId !== scope.createdByUserId) return false;
    if (filters.from && sale.saleDate < filters.from) return false;
    if (filters.to && sale.saleDate > filters.to) return false;
    if (filters.tipe && (sale.tipeCodeSnapshot || sale.tipeId || "") !== filters.tipe) return false;
    if (filters.paymentMethod && sale.paymentMethod !== filters.paymentMethod) return false;
    if (filters.rekening) {
      const rekeningValues = [sale.rekeningId, sale.rekeningNameSnapshot, sale.transferAccount].filter(Boolean);
      if (!rekeningValues.includes(filters.rekening)) return false;
    }
    if (filters.approvalStatus && (sale.approvalStatus || "approved") !== filters.approvalStatus) return false;
    if (filters.syncStatus && (sale.syncStatus || "local") !== filters.syncStatus) return false;
    if (keyword) {
      const haystack = [sale.id, sale.transactionNumber, sale.customerName, sale.customerLocation, sale.testReference, sale.erpReference, sale.createdByNameSnapshot].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function toSale(row: SalesRecordWithItems): Sale {
  return {
    id: row.id,
    saleDate: jakartaDateKey(row.saleDate),
    transactionNumber: row.transactionNumber || undefined,
    transactionAt: row.transactionAt?.toISOString(),
    transactionSequence: row.transactionSequence ?? undefined,
    transactionDateKey: row.transactionDateKey || undefined,
    deliveryAt: row.deliveryAt?.toISOString(),
    tipeId: row.tipeId,
    tipeCodeSnapshot: row.tipeCodeSnapshot,
    tipeNameSnapshot: row.tipeNameSnapshot,
    customerName: row.customerName,
    customerLocation: row.customerLocation || undefined,
    shippingMethod: row.shippingMethod || undefined,
    paymentMethod: row.paymentMethod as Sale["paymentMethod"],
    dueDate: row.dueDate ? jakartaDateKey(row.dueDate) : undefined,
    initialPaymentAmount: Number(row.initialPaymentAmount || 0),
    initialPaymentMethod: row.initialPaymentMethod as Sale["initialPaymentMethod"] || undefined,
    initialPaymentRekeningId: row.initialPaymentRekeningId || undefined,
    initialPaymentRekeningNameSnapshot: row.initialPaymentRekeningNameSnapshot || undefined,
    initialPaymentNotes: row.initialPaymentNotes || undefined,
    rekeningId: row.rekeningId || undefined,
    rekeningNameSnapshot: row.rekeningNameSnapshot || undefined,
    transferAccount: row.transferAccount || undefined,
    notes: row.notes || undefined,
    total: Number(row.total),
    approvalStatus: row.approvalStatus as Sale["approvalStatus"],
    syncTarget: row.syncTarget as Sale["syncTarget"],
    syncStatus: row.syncStatus as Sale["syncStatus"],
    syncError: row.syncError || undefined,
    syncAttemptedAt: row.syncAttemptedAt?.toISOString(),
    syncedAt: row.syncedAt?.toISOString(),
    erpReference: row.erpReference || undefined,
    erpInvoiceId: row.erpInvoiceId || undefined,
    erpInvoiceNumber: row.erpInvoiceNumber || undefined,
    erpSyncHttpStatus: row.erpSyncHttpStatus ?? undefined,
    erpSyncResponse: row.erpSyncResponse ?? undefined,
    stockReleaseStatus: row.stockReleaseStatus as Sale["stockReleaseStatus"],
    stockReleaseError: row.stockReleaseError || undefined,
    stockReleaseReference: row.stockReleaseReference || undefined,
    stockReleasedAt: row.stockReleasedAt?.toISOString(),
    stockReleaseHttpStatus: row.stockReleaseHttpStatus ?? undefined,
    stockReleaseResponse: row.stockReleaseResponse ?? undefined,
    erpPaymentStatus: row.erpPaymentStatus as Sale["erpPaymentStatus"],
    erpPaymentError: row.erpPaymentError || undefined,
    erpPaymentReference: row.erpPaymentReference || undefined,
    erpPaymentSyncedAt: row.erpPaymentSyncedAt?.toISOString(),
    erpPaymentAttemptedAt: row.erpPaymentAttemptedAt?.toISOString(),
    testReference: row.testReference || undefined,
    isTestTransaction: row.isTestTransaction,
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdByRoleSnapshot: row.createdByRoleSnapshot,
    createdAt: row.createdAt.toISOString(),
    items: row.items.map((item) => ({
      productRef: item.productRef,
      productId: item.productId || undefined,
      productInputMode: item.manualProduct ? "manual" : "erp",
      manualProduct: item.manualProduct && typeof item.manualProduct === "object" ? item.manualProduct as Sale["items"][number]["manualProduct"] : undefined,
      warehouseId: item.warehouseId || undefined,
      warehouseNameSnapshot: item.warehouseNameSnapshot || undefined,
      rackId: item.rackId || undefined,
      rackNameSnapshot: item.rackNameSnapshot || undefined,
      unitSnapshot: item.unitSnapshot || undefined,
      uomIdSnapshot: item.uomIdSnapshot ?? undefined,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount)
    }))
  };
}

function legacyToSale(row: LegacySalesRow, items: LegacySalesItemRow[]): Sale {
  return {
    id: row.id,
    saleDate: jakartaDateKey(row.saleDate),
    tipeId: row.tipeId,
    tipeCodeSnapshot: row.tipeCodeSnapshot,
    tipeNameSnapshot: row.tipeNameSnapshot,
    customerName: row.customerName,
    customerLocation: row.customerLocation || undefined,
    shippingMethod: row.shippingMethod || undefined,
    paymentMethod: row.paymentMethod as Sale["paymentMethod"],
    dueDate: row.dueDate ? jakartaDateKey(row.dueDate) : undefined,
    rekeningId: row.rekeningId || undefined,
    transferAccount: row.transferAccount || undefined,
    notes: row.notes || undefined,
    total: Number(row.total),
    approvalStatus: row.approvalStatus as Sale["approvalStatus"],
    syncTarget: row.syncTarget as Sale["syncTarget"],
    syncStatus: row.syncStatus as Sale["syncStatus"],
    syncError: row.syncError || undefined,
    syncAttemptedAt: row.syncAttemptedAt?.toISOString(),
    syncedAt: row.syncedAt?.toISOString(),
    erpReference: row.erpReference || undefined,
    erpSyncHttpStatus: row.erpSyncHttpStatus ?? undefined,
    erpSyncResponse: row.erpSyncResponse,
    stockReleaseStatus: row.stockReleaseStatus as Sale["stockReleaseStatus"],
    stockReleaseError: row.stockReleaseError || undefined,
    stockReleaseReference: row.stockReleaseReference || undefined,
    stockReleasedAt: row.stockReleasedAt?.toISOString(),
    stockReleaseHttpStatus: row.stockReleaseHttpStatus ?? undefined,
    stockReleaseResponse: row.stockReleaseResponse,
    erpPaymentStatus: "not_required",
    testReference: row.testReference || undefined,
    isTestTransaction: row.isTestTransaction,
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdByRoleSnapshot: row.createdByRoleSnapshot,
    createdAt: row.createdAt.toISOString(),
    items: items.sort((a, b) => a.sortOrder - b.sortOrder).map((item) => ({
      productRef: item.productRef,
      productId: item.productId || undefined,
      productInputMode: item.manualProduct ? "manual" : "erp",
      manualProduct: item.manualProduct && typeof item.manualProduct === "object" ? item.manualProduct as Sale["items"][number]["manualProduct"] : undefined,
      warehouseId: item.warehouseId || undefined,
      warehouseNameSnapshot: item.warehouseNameSnapshot || undefined,
      rackId: item.rackId || undefined,
      rackNameSnapshot: item.rackNameSnapshot || undefined,
      unitSnapshot: item.unitSnapshot || undefined,
      uomIdSnapshot: item.uomIdSnapshot ?? undefined,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount)
    }))
  };
}

async function listLegacySalesRecords(): Promise<Sale[]> {
  const rows = await prisma.$queryRaw<LegacySalesRow[]>`SELECT "id", "saleDate", "tipeId", "tipeCodeSnapshot", "tipeNameSnapshot", "customerName", "customerLocation", "shippingMethod", "paymentMethod", "dueDate", "rekeningId", "transferAccount", "notes", "total", "approvalStatus", "syncTarget", "syncStatus", "syncError", "syncAttemptedAt", "syncedAt", "erpReference", "stockReleaseStatus", "stockReleaseError", "stockReleaseReference", "stockReleasedAt", "testReference", "isTestTransaction", "createdByUserId", "createdByNameSnapshot", "createdByRoleSnapshot", "createdAt" FROM "SalesRecord" ORDER BY "createdAt" DESC`;
  const itemRows = await prisma.$queryRaw<LegacySalesItemRow[]>`SELECT "salesRecordId", "productRef", "productId", "manualProduct", "warehouseId", "warehouseNameSnapshot", "rackId", "rackNameSnapshot", "unitSnapshot", "uomIdSnapshot", "quantity", "unitPrice", "discount", "sortOrder" FROM "SalesRecordItem"`;
  const itemsBySale = new Map<string, LegacySalesItemRow[]>();
  for (const item of itemRows) itemsBySale.set(item.salesRecordId, [...(itemsBySale.get(item.salesRecordId) || []), item]);
  return rows.map((row) => legacyToSale(row, itemsBySale.get(row.id) || []));
}

async function listPrismaSalesRecordsSafe(): Promise<Sale[]> {
  try {
    const rows = await prisma.salesRecord.findMany({ include: salesInclude, orderBy: { createdAt: "desc" } });
    return rows.map(toSale);
  } catch (error) {
    if (isMissingColumnError(error)) return listLegacySalesRecords().catch(() => []);
    return [];
  }
}

async function getPrismaSalesRecordSafe(id: string): Promise<Sale | undefined> {
  try {
    const row = await prisma.salesRecord.findUnique({ where: { id }, include: salesInclude });
    return row ? toSale(row) : undefined;
  } catch {
    return undefined;
  }
}

function mergeSalesRecords(primary: Sale[], secondary: Sale[]) {
  const byId = new Map<string, Sale>();
  for (const sale of [...secondary, ...primary]) byId.set(sale.id, sale);
  return Array.from(byId.values()).sort((a, b) => new Date(b.createdAt || b.saleDate).getTime() - new Date(a.createdAt || a.saleDate).getTime());
}

export async function listSalesRecords(): Promise<Sale[]> {
  if (isProductionMode()) {
    const rows = await prisma.salesRecord.findMany({ include: salesInclude, orderBy: { createdAt: "desc" } }).catch((error) => {
      if (isMissingColumnError(error)) return undefined;
      throw error;
    });
    if (!rows) return listLegacySalesRecords();
    return rows.map(toSale);
  }
  const rows = await readJsonArray<Sale>(fileName);
  return mergeSalesRecords(rows, await listPrismaSalesRecordsSafe());
}

export async function listSalesRecordsPage(input: { page?: number; pageSize?: number; filters?: SalesRecordFilters; scope?: SalesRecordScope } = {}): Promise<PaginatedSalesRecords> {
  const page = cleanPage(input.page);
  const pageSize = cleanPageSize(input.pageSize);
  if (isProductionMode()) {
    const where = buildSalesWhere(input.filters || {}, input.scope);
    const [total, rows] = await Promise.all([
      prisma.salesRecord.count({ where }),
      prisma.salesRecord.findMany({
        where,
        include: salesInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    return { data: rows.map(toSale), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }
  const filtered = filterSalesRecordsInMemory(await listSalesRecords(), input.filters || {}, input.scope);
  const total = filtered.length;
  return { data: filtered.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function listSalesTipeOptions(): Promise<string[]> {
  if (isProductionMode()) {
    const rows = await prisma.salesRecord.findMany({
      distinct: ["tipeCodeSnapshot"],
      select: { tipeCodeSnapshot: true },
      orderBy: { tipeCodeSnapshot: "asc" }
    });
    return rows.map((row) => row.tipeCodeSnapshot).filter(Boolean);
  }
  return Array.from(new Set((await listSalesRecords()).map((sale) => sale.tipeCodeSnapshot || sale.tipeId).filter(Boolean))).sort() as string[];
}

export async function getSalesRecord(id: string): Promise<Sale | undefined> {
  if (isProductionMode()) {
    const row = await prisma.salesRecord.findUnique({ where: { id }, include: salesInclude });
    return row ? toSale(row) : undefined;
  }
  return (await readJsonArray<Sale>(fileName)).find((sale) => sale.id === id) ?? await getPrismaSalesRecordSafe(id);
}

export async function saveSalesRecord(sale: Sale, options?: { tempo?: TempoCreationInput }): Promise<void> {
  if (isProductionMode()) {
    await prisma.$transaction(async (tx) => {
      const identity = sale.transactionNumber || !sale.transactionAt ? sale : { ...sale, ...await allocateTransactionIdentity(tx, sale.transactionAt) };
      Object.assign(sale, identity);
      await tx.salesRecord.create({
      data: {
        id: identity.id,
        saleDate: new Date(identity.saleDate),
        transactionNumber: identity.transactionNumber,
        transactionAt: identity.transactionAt ? new Date(identity.transactionAt) : undefined,
        transactionSequence: identity.transactionSequence,
        transactionDateKey: identity.transactionDateKey,
        deliveryAt: identity.deliveryAt ? new Date(identity.deliveryAt) : undefined,
        tipeId: sale.tipeId || "W",
        tipeCodeSnapshot: sale.tipeCodeSnapshot || "W",
        tipeNameSnapshot: sale.tipeNameSnapshot || "W",
        customerName: sale.customerName,
        customerLocation: sale.customerLocation,
        shippingMethod: sale.shippingMethod,
        paymentMethod: sale.paymentMethod,
        dueDate: sale.dueDate ? new Date(sale.dueDate) : undefined,
        initialPaymentAmount: sale.initialPaymentAmount || 0,
        initialPaymentMethod: sale.initialPaymentMethod,
        initialPaymentRekeningId: sale.initialPaymentRekeningId,
        initialPaymentRekeningNameSnapshot: sale.initialPaymentRekeningNameSnapshot,
        initialPaymentNotes: sale.initialPaymentNotes,
        rekeningId: sale.rekeningId,
        rekeningNameSnapshot: sale.rekeningNameSnapshot,
        transferAccount: sale.transferAccount,
        notes: sale.notes,
        total: sale.total,
        approvalStatus: sale.approvalStatus || "approved",
        syncTarget: sale.syncTarget || "local",
        syncStatus: sale.syncStatus || "local",
        syncError: sale.syncError,
        syncAttemptedAt: sale.syncAttemptedAt ? new Date(sale.syncAttemptedAt) : undefined,
        syncedAt: sale.syncedAt ? new Date(sale.syncedAt) : undefined,
        erpReference: sale.erpReference,
        erpInvoiceId: sale.erpInvoiceId,
        erpInvoiceNumber: sale.erpInvoiceNumber,
        erpSyncHttpStatus: sale.erpSyncHttpStatus,
        erpSyncResponse: sale.erpSyncResponse === undefined ? undefined : serializeJson(sale.erpSyncResponse),
        stockReleaseStatus: sale.stockReleaseStatus || "not_required",
        stockReleaseError: sale.stockReleaseError,
        stockReleaseReference: sale.stockReleaseReference,
        stockReleasedAt: sale.stockReleasedAt ? new Date(sale.stockReleasedAt) : undefined,
        stockReleaseHttpStatus: sale.stockReleaseHttpStatus,
        stockReleaseResponse: sale.stockReleaseResponse === undefined ? undefined : serializeJson(sale.stockReleaseResponse),
        erpPaymentStatus: sale.erpPaymentStatus || "not_required",
        erpPaymentError: sale.erpPaymentError,
        erpPaymentReference: sale.erpPaymentReference,
        erpPaymentSyncedAt: sale.erpPaymentSyncedAt ? new Date(sale.erpPaymentSyncedAt) : undefined,
        erpPaymentAttemptedAt: sale.erpPaymentAttemptedAt ? new Date(sale.erpPaymentAttemptedAt) : undefined,
        testReference: sale.testReference,
        isTestTransaction: sale.isTestTransaction || false,
        createdByUserId: sale.createdByUserId || "system",
        createdByNameSnapshot: sale.createdByNameSnapshot || "System",
        createdByRoleSnapshot: (sale.createdByRoleSnapshot || "OWNER") as Role,
        createdAt: sale.createdAt ? new Date(sale.createdAt) : new Date(),
        items: {
          create: sale.items.map((item, index) => ({
            id: `${sale.id}-item-${index}`,
            productRef: item.productRef,
            productId: item.productId,
            manualProduct: item.manualProduct ? serializeJson(item.manualProduct) : undefined,
            warehouseId: item.warehouseId,
            warehouseNameSnapshot: item.warehouseNameSnapshot,
            rackId: item.rackId,
            rackNameSnapshot: item.rackNameSnapshot,
            unitSnapshot: item.unitSnapshot,
            uomIdSnapshot: item.uomIdSnapshot,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            sortOrder: index
          }))
        }
      }
      });
      if (options?.tempo) await createTempoReceivableInTransaction(tx, options.tempo, {
        id: sale.createdByUserId || "system", name: sale.createdByNameSnapshot || "System", role: (sale.createdByRoleSnapshot || "OWNER") as Role
      });
    });
    return;
  }
  const rows = await readJsonArray<Sale>(fileName);
  const identity = sale.transactionNumber || !sale.transactionAt ? sale : { ...sale, ...nextJsonTransactionIdentity(rows, sale.transactionAt) };
  Object.assign(sale, identity);
  rows.unshift(identity);
  await writeJsonArray(fileName, rows);
}

export async function updateSalesApprovalStatus(id: string, approvalStatus: Sale["approvalStatus"]): Promise<Sale | null> {
  if (isProductionMode()) {
    const row = await prisma.salesRecord.update({ where: { id }, data: { approvalStatus: approvalStatus || "draft" }, include: salesInclude }).catch(() => null);
    return row ? toSale(row) : null;
  }
  const rows = await readJsonArray<Sale>(fileName);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return null;
  rows[index] = { ...rows[index], approvalStatus };
  await writeJsonArray(fileName, rows);
  return rows[index];
}

function assertSaleManageable(sale: Sale) {
  if (sale.approvalStatus === "cancelled") throw new Error("Transaksi sudah dibatalkan.");
}

function requiresCancelAndRecreate(sale: Sale) {
  return (
    sale.syncTarget === "erp" &&
    (sale.stockReleaseStatus === "released" || sale.erpPaymentStatus === "paid" || sale.erpPaymentStatus === "partial")
  );
}

function assertSalesEditable(sale: Sale) {
  if (requiresCancelAndRecreate(sale)) {
    throw new Error(
      "ERP menolak update transaksi karena transaksi sudah masuk proses lanjutan. Batalkan transaksi lama di ERP lalu buat transaksi koreksi baru dengan ERP reference baru."
    );
  }
}

function cancelReferenceForSale(id: string) {
  return `SLM-CANCEL-${id}`.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100);
}

function invoiceIdentityForSale(sale: Sale) {
  if (sale.erpInvoiceId || sale.erpInvoiceNumber) return { invoiceId: sale.erpInvoiceId, invoiceNumber: sale.erpInvoiceNumber };
  const row = sale.erpSyncResponse && typeof sale.erpSyncResponse === "object" ? sale.erpSyncResponse as Record<string, unknown> : undefined;
  const nested = row?.data && typeof row.data === "object" ? row.data as Record<string, unknown> : undefined;
  const invoice = row?.invoice && typeof row.invoice === "object" ? row.invoice as Record<string, unknown> : undefined;
  const nestedInvoice = nested?.invoice && typeof nested.invoice === "object" ? nested.invoice as Record<string, unknown> : undefined;
  const invoiceList = Array.isArray(row?.invoices) ? row.invoices : Array.isArray(nested?.invoices) ? nested.invoices : [];
  const firstInvoice = invoiceList[0] && typeof invoiceList[0] === "object" ? invoiceList[0] as Record<string, unknown> : undefined;
  const idValue = row?.invoice_id ?? invoice?.id ?? nested?.invoice_id ?? nestedInvoice?.id ?? firstInvoice?.id;
  const invoiceId = typeof idValue === "number" ? idValue : typeof idValue === "string" && /^\d+$/.test(idValue.trim()) ? Number(idValue) : undefined;
  const numberValue = row?.invoice_number ?? invoice?.invoice_number ?? nested?.invoice_number ?? nestedInvoice?.invoice_number ?? firstInvoice?.invoice_number ?? row?.slm_invoice_number ?? nested?.slm_invoice_number;
  return { invoiceId, invoiceNumber: typeof numberValue === "string" ? numberValue : undefined };
}

async function markCancelReconciliationError(id: string, message: string) {
  const updated = await prisma.salesRecord.update({ where: { id }, data: { syncError: `Cancel ERP perlu rekonsiliasi: ${message}` } }).then(() => true).catch(() => false);
  if (updated) return;
  const rows = await readJsonArray<Sale>(fileName);
  const index = rows.findIndex((row) => row.id === id);
  if (index >= 0) {
    rows[index] = { ...rows[index], syncError: `Cancel ERP perlu rekonsiliasi: ${message}` };
    await writeJsonArray(fileName, rows);
  }
}

async function cancelPrismaSaleAtomically(id: string, before: Sale, cleanReason: string, actor: Awaited<ReturnType<typeof getCurrentUser>>, requiresErpCancellation: boolean, erpCancellation?: SalesCancellationResult) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.salesRecord.update({
      where: { id },
      data: {
        approvalStatus: "cancelled",
        syncStatus: requiresErpCancellation ? "synced" : before.syncTarget === "erp" ? "failed" : before.syncStatus || "local",
        syncError: requiresErpCancellation ? "Transaksi dibatalkan dan sudah dibatalkan di ERP." : before.syncTarget === "erp" ? "Transaksi dibatalkan sebelum berhasil tersinkron ERP." : before.syncError,
        stockReleaseStatus: erpCancellation?.stockReversalStatus === "reversed" ? "reversed" : before.stockReleaseStatus,
        erpPaymentStatus: erpCancellation?.paymentReversalStatus === "reversed" ? "reversed" : erpCancellation?.paymentReversalStatus === "not_found" ? "not_required" : before.erpPaymentStatus,
        erpPaymentError: erpCancellation?.paymentReversalStatus === "not_found" ? null : before.erpPaymentError
      },
      include: salesInclude
    });
    const tempo = await tx.tempoReceivable.findUnique({ where: { salesId: id }, include: { payments: true } });
    if (tempo && !["cancelled", "written_off"].includes(tempo.status)) {
      await tx.tempoReceivable.update({ where: { id: tempo.id }, data: { status: "cancelled", updatedAt: new Date() } });
      for (const payment of tempo.payments) {
        await tx.tempoPaymentReversal.upsert({
          where: { id: `TPR-CANCEL-${payment.id}` },
          create: {
            id: `TPR-CANCEL-${payment.id}`,
            tempoPaymentId: payment.id,
            reversalDate: new Date(),
            amount: payment.amountPaid,
            reason: cleanReason,
            erpStatus: erpCancellation?.paymentReversalStatus || (payment.erpPaymentStatus === "not_required" ? "not_required" : "reversed"),
            erpReference: erpCancellation?.reversalReference,
            createdByUserId: actor.id,
            createdByNameSnapshot: actor.name,
            createdAt: new Date()
          },
          update: {}
        });
        await tx.auditLog.create({ data: { id: crypto.randomUUID(), entityType: "tempo_payment", entityId: payment.id, action: "reverse", beforeValue: serializeJson(payment), afterValue: serializeJson({ reversalId: `TPR-CANCEL-${payment.id}`, amount: Number(payment.amountPaid), erpStatus: erpCancellation?.paymentReversalStatus || "not_required", erpReference: erpCancellation?.reversalReference }), userId: actor.id, userNameSnapshot: actor.name, userRoleSnapshot: actor.role, reason: cleanReason } });
      }
      await tx.auditLog.create({ data: { id: crypto.randomUUID(), entityType: "tempo", entityId: tempo.id, action: "cancel", beforeValue: serializeJson(tempo), afterValue: serializeJson({ status: "cancelled", reversals: tempo.payments.map((payment) => `TPR-CANCEL-${payment.id}`) }), userId: actor.id, userNameSnapshot: actor.name, userRoleSnapshot: actor.role, reason: cleanReason } });
    }
    if (erpCancellation?.stockReversalStatus) await tx.auditLog.create({ data: { id: crypto.randomUUID(), entityType: "stock_release", entityId: before.stockReleaseReference || id, action: "reverse", beforeValue: serializeJson({ status: before.stockReleaseStatus, reference: before.stockReleaseReference }), afterValue: serializeJson({ status: erpCancellation.stockReversalStatus, reversalReference: erpCancellation.reversalReference }), userId: actor.id, userNameSnapshot: actor.name, userRoleSnapshot: actor.role, reason: cleanReason } });
    const after = toSale(row);
    await tx.auditLog.create({ data: { id: crypto.randomUUID(), entityType: "sales", entityId: id, action: "cancel", beforeValue: serializeJson(before), afterValue: serializeJson(erpCancellation ? { ...after, erpCancellation } : after), userId: actor.id, userNameSnapshot: actor.name, userRoleSnapshot: actor.role, reason: cleanReason } });
    return after;
  });
}

function saleTotal(input: Pick<Sale, "items">) {
  return input.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - (item.discount || 0)), 0);
}

async function updatePrismaSalesRecord(
  id: string,
  input: PenjualanInput,
  before: Sale,
  total: number,
  tipe: BookkeepingType,
  rekening: RekeningAccount | undefined,
  nextSyncStatus: Sale["syncStatus"]
) {
  const rekeningNameSnapshot = rekeningSnapshotForUpdate(before, rekening);
  const row = await prisma.$transaction(async (tx) => {
    await tx.salesRecordItem.deleteMany({ where: { salesRecordId: id } });
    return tx.salesRecord.update({
      where: { id },
      data: {
        saleDate: new Date(input.saleDate),
        transactionAt: input.transactionAt ? new Date(input.transactionAt) : before.transactionAt ? new Date(before.transactionAt) : null,
        deliveryAt: input.deliveryAt ? new Date(input.deliveryAt) : null,
        tipeId: tipe.id,
        tipeCodeSnapshot: tipe.code,
        tipeNameSnapshot: tipe.name,
        customerName: input.customerName,
        customerLocation: input.customerLocation,
        shippingMethod: input.shippingMethod,
        paymentMethod: input.paymentMethod,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        rekeningId: rekening?.id,
        rekeningNameSnapshot,
        transferAccount: input.transferAccount,
        notes: input.notes,
        total,
        syncStatus: nextSyncStatus,
        syncError: before.syncTarget === "erp" ? "Transaksi diubah dan menunggu sinkronisasi ulang." : null,
        syncedAt: before.syncTarget === "erp" ? null : before.syncedAt ? new Date(before.syncedAt) : null,
        erpReference: before.erpReference || null,
        erpSyncHttpStatus: before.syncTarget === "erp" ? null : before.erpSyncHttpStatus,
        erpSyncResponse: before.syncTarget === "erp" ? undefined : before.erpSyncResponse === undefined ? undefined : serializeJson(before.erpSyncResponse),
        stockReleaseStatus: before.syncTarget === "erp" ? "pending" : before.stockReleaseStatus || "not_required",
        stockReleaseError: before.syncTarget === "erp" ? "Menunggu update invoice ERP berhasil sebelum release stok ulang." : before.stockReleaseError || null,
        stockReleaseReference: before.syncTarget === "erp" ? null : before.stockReleaseReference || null,
        stockReleasedAt: before.syncTarget === "erp" ? null : before.stockReleasedAt ? new Date(before.stockReleasedAt) : null,
        stockReleaseHttpStatus: before.syncTarget === "erp" ? null : before.stockReleaseHttpStatus,
        stockReleaseResponse: before.syncTarget === "erp" ? undefined : before.stockReleaseResponse === undefined ? undefined : serializeJson(before.stockReleaseResponse),
        erpPaymentStatus: before.syncTarget === "erp" ? "pending" : before.erpPaymentStatus || "not_required",
        erpPaymentError: before.syncTarget === "erp" ? "Menunggu update invoice ERP dan release stok ulang sebelum payment ERP." : before.erpPaymentError || null,
        erpPaymentReference: before.syncTarget === "erp" ? null : before.erpPaymentReference || null,
        erpPaymentSyncedAt: before.syncTarget === "erp" ? null : before.erpPaymentSyncedAt ? new Date(before.erpPaymentSyncedAt) : null,
        erpPaymentAttemptedAt: before.syncTarget === "erp" ? null : before.erpPaymentAttemptedAt ? new Date(before.erpPaymentAttemptedAt) : null,
        items: {
          create: input.items.map((item, index) => ({
            id: `${id}-item-${Date.now()}-${index}`,
            productRef: item.productRef,
            productId: item.productId,
            manualProduct: item.manualProduct ? serializeJson(item.manualProduct) : undefined,
            warehouseId: item.warehouseId,
            warehouseNameSnapshot: item.warehouseNameSnapshot,
            rackId: item.rackId,
            rackNameSnapshot: item.rackNameSnapshot,
            unitSnapshot: item.unitSnapshot,
            uomIdSnapshot: item.uomIdSnapshot,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            sortOrder: index
          }))
        }
      },
      include: salesInclude
    });
  });
  return toSale(row);
}

export async function updateSalesRecord(id: string, input: PenjualanInput): Promise<Sale> {
  const before = await getSalesRecord(id);
  if (!before) throw Object.assign(new Error("Transaksi penjualan tidak ditemukan."), { code: "SALES_NOT_FOUND" });
  assertSaleManageable(before);
  assertSalesEditable(before);
  if (
    Number(input.initialPaymentAmount || 0) !== Number(before.initialPaymentAmount || 0) ||
    (input.initialPaymentMethod || undefined) !== (before.initialPaymentMethod || undefined) ||
    (input.initialPaymentRekeningId || undefined) !== (before.initialPaymentRekeningId || undefined) ||
    (input.initialPaymentNotes || undefined) !== (before.initialPaymentNotes || undefined)
  ) throw new Error("Pembayaran awal/DP tidak dapat diedit. Gunakan cancel/koreksi lalu buat transaksi baru.");
  const transactionAt = input.transactionAt ? jakartaTimestampFromLocal(input.transactionAt) : before.transactionAt;
  const deliveryAt = input.deliveryAt === undefined ? before.deliveryAt : input.deliveryAt ? jakartaTimestampFromLocal(input.deliveryAt) : undefined;
  if (deliveryAt && transactionAt && deliveryAt < transactionAt) throw new Error("Tanggal dan jam kirim tidak boleh sebelum waktu transaksi.");
  const normalizedInput: PenjualanInput = { ...input, transactionAt, deliveryAt, saleDate: transactionAt ? transactionDateKey(transactionAt) : input.saleDate };
  const total = saleTotal(normalizedInput);
  const tipe = await findTipe(normalizedInput.tipeId || before.tipeId);
  const rekening = await resolveRekeningForUpdate(before, normalizedInput, tipe);
  const rekeningNameSnapshot = rekeningSnapshotForUpdate(before, rekening);
  const nextSyncStatus = before.syncTarget === "erp" ? "pending" : "local";
  if (isProductionMode()) {
    const after = await updatePrismaSalesRecord(id, normalizedInput, before, total, tipe, rekening, nextSyncStatus);
    await recordAudit({ entityType: "sales", entityId: id, action: "update", beforeValue: before, afterValue: after, reason: before.syncTarget === "erp" ? "Edit transaksi ERP belum synced • masuk antrian sync ulang" : "Edit transaksi lokal" });
    return after;
  }
  const rows = await readJsonArray<Sale>(fileName);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) {
    const after = await updatePrismaSalesRecord(id, normalizedInput, before, total, tipe, rekening, nextSyncStatus);
    await recordAudit({ entityType: "sales", entityId: id, action: "update", beforeValue: before, afterValue: after, reason: before.syncTarget === "erp" ? "Edit transaksi ERP belum synced • masuk antrian sync ulang" : "Edit transaksi lokal" });
    return after;
  }
  const after: Sale = { ...before, ...normalizedInput, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, rekeningId: rekening?.id, rekeningNameSnapshot, total, syncStatus: nextSyncStatus, syncError: before.syncTarget === "erp" ? "Transaksi diubah dan menunggu sinkronisasi ulang." : undefined, syncedAt: before.syncTarget === "erp" ? undefined : before.syncedAt, erpReference: before.erpReference, erpSyncHttpStatus: before.syncTarget === "erp" ? undefined : before.erpSyncHttpStatus, erpSyncResponse: before.syncTarget === "erp" ? undefined : before.erpSyncResponse, stockReleaseStatus: before.syncTarget === "erp" ? "pending" : before.stockReleaseStatus || "not_required", stockReleaseError: before.syncTarget === "erp" ? "Menunggu update invoice ERP berhasil sebelum release stok ulang." : before.stockReleaseError, stockReleaseReference: before.syncTarget === "erp" ? undefined : before.stockReleaseReference, stockReleasedAt: before.syncTarget === "erp" ? undefined : before.stockReleasedAt, stockReleaseHttpStatus: before.syncTarget === "erp" ? undefined : before.stockReleaseHttpStatus, stockReleaseResponse: before.syncTarget === "erp" ? undefined : before.stockReleaseResponse, erpPaymentStatus: before.syncTarget === "erp" ? "pending" : before.erpPaymentStatus || "not_required", erpPaymentError: before.syncTarget === "erp" ? "Menunggu update invoice ERP dan release stok ulang sebelum payment ERP." : before.erpPaymentError, erpPaymentReference: before.syncTarget === "erp" ? undefined : before.erpPaymentReference, erpPaymentSyncedAt: before.syncTarget === "erp" ? undefined : before.erpPaymentSyncedAt, erpPaymentAttemptedAt: before.syncTarget === "erp" ? undefined : before.erpPaymentAttemptedAt };
  rows[index] = after;
  await writeJsonArray(fileName, rows);
  await recordAudit({ entityType: "sales", entityId: id, action: "update", beforeValue: before, afterValue: after, reason: before.syncTarget === "erp" ? "Edit transaksi ERP belum synced • masuk antrian sync ulang" : "Edit transaksi lokal" });
  return after;
}

export async function cancelSalesRecord(id: string, reason: string): Promise<Sale> {
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("Alasan cancel wajib diisi.");
  const before = await getSalesRecord(id);
  if (!before) throw new Error("Transaksi penjualan tidak ditemukan.");
  if (before.approvalStatus === "cancelled") throw new Error("Transaksi sudah dibatalkan.");
  const requiresErpCancellation = before.syncTarget === "erp" && before.syncStatus === "synced";
  const actor = await getCurrentUser();
  let erpCancellation: SalesCancellationResult | undefined;
  if (requiresErpCancellation) {
    const invoiceIdentity = invoiceIdentityForSale(before);
    const response = await cancelErpSales({
      erpReference: cancelReferenceForSale(id),
      sourceNumber: invoiceIdentity.invoiceNumber,
      invoiceId: invoiceIdentity.invoiceId,
      saleReference: id,
      stockReleaseReference: before.stockReleaseReference,
      paymentReference: before.erpPaymentReference,
      cancelDate: transactionDateKey(new Date().toISOString()),
      reason: cleanReason,
      requestedBy: {
        id: actor.id,
        name: actor.name,
        role: actor.role,
      },
    });
    if (!response.success) {
      await markCancelReconciliationError(id, response.message || "Cancel transaksi ERP gagal.");
      throw new Error(response.message || "Cancel transaksi ERP gagal.");
    }
    erpCancellation = response.data;
  }
  if (isProductionMode()) {
    return cancelPrismaSaleAtomically(id, before, cleanReason, actor, requiresErpCancellation, erpCancellation);
  }
  const rows = await readJsonArray<Sale>(fileName);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) {
    return cancelPrismaSaleAtomically(id, before, cleanReason, actor, requiresErpCancellation, erpCancellation);
  }
  const after: Sale = {
    ...before,
    approvalStatus: "cancelled",
    syncStatus: requiresErpCancellation ? "synced" : before.syncTarget === "erp" ? "failed" : before.syncStatus,
    syncError: requiresErpCancellation ? "Transaksi dibatalkan dan sudah dibatalkan di ERP." : before.syncTarget === "erp" ? "Transaksi dibatalkan sebelum berhasil tersinkron ERP." : before.syncError
  };
  rows[index] = after;
  await writeJsonArray(fileName, rows);
  await recordAudit({
    entityType: "sales",
    entityId: id,
    action: "cancel",
    beforeValue: before,
    afterValue: erpCancellation ? { ...after, erpCancellation } : after,
    reason: cleanReason
  });
  return after;
}
