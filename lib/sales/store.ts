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
import { cancelStockRelease, nextRevisionReference, releaseSaleStock } from "@/lib/api/stockReleases";
import { jakartaDateKey, jakartaTimestampFromLocal, transactionDateKey, transactionNumberFor } from "@/lib/date/jakarta";
import { createTempoReceivableInTransaction, syncTempoReceivableOnSalesEdit, syncTempoReceivableOnSalesEditInTransaction, type TempoCreationInput } from "@/lib/tempo/store";
import { createDeliveryOrderForSale, syncDeliveryOrderForSale } from "@/lib/deliveryOrders/store";
import { postSalesInvoiceJournal, postSalesCogsJournal, reverseSalesJournals } from "@/lib/sales/postingHooks";

const fileName = "sales-records.json";
const isProductionMode = () => process.env.NEXT_PUBLIC_APP_MODE === "production";
const salesInclude = { items: { orderBy: { sortOrder: "asc" as const } } };

export async function allocateTransactionIdentity(tx: Prisma.TransactionClient, transactionAt: string) {
  const dateKey = transactionDateKey(transactionAt);
  if (!tx?.dailyTransactionCounter?.upsert) {
    return {
      transactionAt,
      transactionDateKey: dateKey,
      transactionSequence: 1,
      transactionNumber: transactionNumberFor(dateKey, 1)
    };
  }
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
  cctvStatus?: string;
};
export type SalesRecordScope = {
  createdByUserId?: string;
  excludeSource?: string;
  includeSources?: string[];
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

export function buildSalesWhere(filters: SalesRecordFilters, scope: SalesRecordScope = {}): Prisma.SalesRecordWhereInput {
  const where: Prisma.SalesRecordWhereInput = {};
  if (scope.createdByUserId) {
    if (scope.includeSources && scope.includeSources.length > 0) {
      appendSalesWhereAnd(where, {
        OR: [
          { createdByUserId: scope.createdByUserId },
          { source: { in: scope.includeSources } },
        ],
      });
    } else {
      where.createdByUserId = scope.createdByUserId;
    }
  }
  if (scope.excludeSource) where.source = { not: scope.excludeSource };
  if (filters.from || filters.to) {
    where.saleDate = {};
    if (filters.from) where.saleDate.gte = dateStart(filters.from);
    if (filters.to) where.saleDate.lte = dateEnd(filters.to);
  }
  if (filters.tipe) {
    appendSalesWhereAnd(where, {
      OR: [{ tipeCodeSnapshot: filters.tipe }, { tipeId: filters.tipe }],
    });
  }
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.rekening) {
    appendSalesWhereAnd(where, {
      OR: [
        { rekeningId: filters.rekening },
        { rekeningNameSnapshot: { contains: filters.rekening, mode: "insensitive" } },
        { transferAccount: { contains: filters.rekening, mode: "insensitive" } }
      ]
    });
  }
  if (filters.approvalStatus) where.approvalStatus = filters.approvalStatus;
  if (filters.syncStatus) where.syncStatus = filters.syncStatus;
  if (filters.cctvStatus && filters.cctvStatus !== "all") {
    if (filters.cctvStatus === "detected" || filters.cctvStatus === "ya") {
      where.doPackingStatus = "sudah";
    } else if (filters.cctvStatus === "undetected" || filters.cctvStatus === "tidak") {
      where.doPackingStatus = { not: "sudah" };
    }
  }
  const keyword = filters.keyword?.trim();
  if (keyword) {
    const keywordOr: Prisma.SalesRecordWhereInput[] = [
      { id: { contains: keyword, mode: "insensitive" } },
      { transactionNumber: { contains: keyword, mode: "insensitive" } },
      { customerName: { contains: keyword, mode: "insensitive" } },
      { customerLocation: { contains: keyword, mode: "insensitive" } },
      { testReference: { contains: keyword, mode: "insensitive" } },
      { erpReference: { contains: keyword, mode: "insensitive" } },
      { createdByNameSnapshot: { contains: keyword, mode: "insensitive" } },
      { items: { some: { productRef: { contains: keyword, mode: "insensitive" } } } }
    ];
    appendSalesWhereAnd(where, { OR: keywordOr });
  }
  return where;
}

export function filterSalesRecordsInMemory(sales: Sale[], filters: SalesRecordFilters, scope: SalesRecordScope = {}) {
  const keyword = filters.keyword?.trim().toLowerCase();
  return sales.filter((sale) => {
    if (scope.createdByUserId) {
      const matchCreator = sale.createdByUserId === scope.createdByUserId;
      const matchSource = Boolean(
        scope.includeSources &&
          sale.source &&
          scope.includeSources.includes(sale.source),
      );
      if (!matchCreator && !matchSource) return false;
    }
    if (scope.excludeSource && sale.source === scope.excludeSource) return false;
    if (filters.from && sale.saleDate < filters.from) return false;
    if (filters.to && sale.saleDate > filters.to) return false;
    if (filters.tipe && (sale.tipeCodeSnapshot || sale.tipeId || "") !== filters.tipe) return false;
    if (filters.paymentMethod && sale.paymentMethod !== filters.paymentMethod) return false;
    if (filters.rekening) {
      const target = filters.rekening.toLowerCase();
      const rekeningValues = [sale.rekeningId, sale.rekeningNameSnapshot, sale.transferAccount]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      if (!rekeningValues.some((v) => v === target || v.includes(target))) return false;
    }
    if (filters.approvalStatus && (sale.approvalStatus || "approved") !== filters.approvalStatus) return false;
    if (filters.syncStatus && (sale.syncStatus || "local") !== filters.syncStatus) return false;
    if (filters.cctvStatus && filters.cctvStatus !== "all") {
      const isDetected = sale.doPackingStatus === "sudah";
      const wantDetected = filters.cctvStatus === "detected" || filters.cctvStatus === "ya";
      const wantUndetected = filters.cctvStatus === "undetected" || filters.cctvStatus === "tidak";
      if (wantDetected && !isDetected) return false;
      if (wantUndetected && isDetected) return false;
    }
    if (keyword) {
      const itemsHaystack = (sale.items || []).map((i) => i.productRef).join(" ");
      const haystack = [
        sale.id,
        sale.transactionNumber,
        sale.customerName,
        sale.customerLocation,
        sale.testReference,
        sale.erpReference,
        sale.createdByNameSnapshot,
        itemsHaystack
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function toSale(row: SalesRecordWithItems): Sale {
  const metadata = row.integrationMetadata && typeof row.integrationMetadata === "object"
    ? (row.integrationMetadata as Record<string, unknown>)
    : {};

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
    customerPhone: row.customerPhone || undefined,
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
    source: row.source,
    externalReference: row.externalReference || undefined,
    integrationPayloadHash: row.integrationPayloadHash || undefined,
    integrationClientId: row.integrationClientId || undefined,
    integrationProcessingMode: row.integrationProcessingMode as Sale["integrationProcessingMode"] || undefined,
    externalCustomerId: row.externalCustomerId || undefined,
    erpCustomerId: row.erpCustomerId || undefined,
    customerSyncStatus: row.customerSyncStatus,
    customerSyncError: row.customerSyncError || undefined,
    isPrinted: Boolean(metadata.is_printed),
    printedAt: metadata.printed_at ? String(metadata.printed_at) : undefined,
    printedBy: metadata.printed_by ? String(metadata.printed_by) : undefined,
    printCount: typeof metadata.print_count === "number" ? metadata.print_count : undefined,
    doStatus: (row.doStatus as Sale["doStatus"]) || "belum_selesai",
    doPackingStatus: (row.doPackingStatus as Sale["doPackingStatus"]) || "belum",
    doShippingStatus: (row.doShippingStatus as Sale["doShippingStatus"]) || "belum",
    doAssignedUserId: row.doAssignedUserId || undefined,
    doAssignedUserName: row.doAssignedUserName || undefined,
    doReceiptPhotoUrl: row.doReceiptPhotoUrl || undefined,
    doTrackingNumber: row.doTrackingNumber || undefined,
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
  const rows = await prisma.$queryRaw<LegacySalesRow[]>`SELECT "id", "saleDate", "tipeId", "tipeCodeSnapshot", "tipeNameSnapshot", "customerName", "customerLocation", "shippingMethod", "paymentMethod", "dueDate", "rekeningId", "transferAccount", "notes", "total", "approvalStatus", "syncTarget", "syncStatus", "syncError", "syncAttemptedAt", "syncedAt", "erpReference", "stockReleaseStatus", "stockReleaseError", "stockReleaseReference", "stockReleasedAt", "testReference", "isTestTransaction", "createdByUserId", "createdByNameSnapshot", "createdByRoleSnapshot", "createdAt" FROM "SalesRecord" ORDER BY "saleDate" DESC, "createdAt" DESC`;
  const itemRows = await prisma.$queryRaw<LegacySalesItemRow[]>`SELECT "salesRecordId", "productRef", "productId", "manualProduct", "warehouseId", "warehouseNameSnapshot", "rackId", "rackNameSnapshot", "unitSnapshot", "uomIdSnapshot", "quantity", "unitPrice", "discount", "sortOrder" FROM "SalesRecordItem"`;
  const itemsBySale = new Map<string, LegacySalesItemRow[]>();
  for (const item of itemRows) itemsBySale.set(item.salesRecordId, [...(itemsBySale.get(item.salesRecordId) || []), item]);
  return rows.map((row) => legacyToSale(row, itemsBySale.get(row.id) || []));
}

async function listPrismaSalesRecordsSafe(): Promise<Sale[]> {
  try {
    const rows = await prisma.salesRecord.findMany({
      include: salesInclude,
      orderBy: [{ saleDate: "desc" }, { transactionAt: "desc" }, { createdAt: "desc" }]
    });
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
  return Array.from(byId.values()).sort((a, b) => {
    const timeA = new Date(a.transactionAt || `${a.saleDate}T00:00:00+07:00`).getTime();
    const timeB = new Date(b.transactionAt || `${b.saleDate}T00:00:00+07:00`).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
}

export async function listSalesRecords(): Promise<Sale[]> {
  if (isProductionMode()) {
    const rows = await prisma.salesRecord.findMany({
      include: salesInclude,
      orderBy: [{ saleDate: "desc" }, { transactionAt: "desc" }, { createdAt: "desc" }]
    }).catch((error) => {
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
        orderBy: [{ saleDate: "desc" }, { transactionAt: "desc" }, { createdAt: "desc" }],
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
        customerPhone: sale.customerPhone,
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
        source: sale.source || "SLM",
        externalReference: sale.externalReference || null,
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
            warehouseId: item.warehouseId || "1",
            warehouseNameSnapshot: item.warehouseNameSnapshot || "Gudang Utama",
            rackId: item.rackId,
            rackNameSnapshot: item.rackNameSnapshot,
            unitSnapshot: item.unitSnapshot || "Pcs",
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

    if (sale.approvalStatus === "approved") {
      await postSalesInvoiceJournal(sale.id).catch((err) => {
        console.error("[JOURNAL] Failed to post sales invoice journal on save:", err);
      });
      await postSalesCogsJournal(sale.id).catch((err) => {
        console.error("[JOURNAL] Failed to post sales COGS journal on save:", err);
      });
    }

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
    const now = new Date();
    const nowIso = now.toISOString();
    const dateKey = transactionDateKey(nowIso);
    let updateData: Prisma.SalesRecordUpdateInput = { approvalStatus: approvalStatus || "draft" };
    if (approvalStatus === "approved") {
      const identity = await prisma.$transaction(async (tx) => allocateTransactionIdentity(tx, nowIso));
      const existingSale = await prisma.salesRecord.findUnique({ where: { id }, select: { deliveryAt: true } });
      const deliveryAt = existingSale?.deliveryAt && existingSale.deliveryAt < now ? now : (existingSale?.deliveryAt || null);
      updateData = {
        ...updateData,
        transactionAt: now,
        saleDate: new Date(dateKey),
        transactionDateKey: identity.transactionDateKey,
        transactionSequence: identity.transactionSequence,
        transactionNumber: identity.transactionNumber,
        deliveryAt
      };
    }
    const row = await prisma.salesRecord.update({ where: { id }, data: updateData, include: salesInclude }).catch(() => null);
    if (row && approvalStatus === "approved") {
      await createDeliveryOrderForSale(id).catch((err) => {
        console.error("[DO] Failed to create delivery order on approval:", err);
      });
      await postSalesInvoiceJournal(id).catch((err) => {
        console.error("[JOURNAL] Failed to post sales invoice journal on approval:", err);
      });
      await postSalesCogsJournal(id).catch((err) => {
        console.error("[JOURNAL] Failed to post sales COGS journal on approval:", err);
      });
    }
    return row ? toSale(row) : null;
  }
  const rows = await readJsonArray<Sale>(fileName);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return null;
  if (approvalStatus === "approved") {
    const nowIso = new Date().toISOString();
    const identity = nextJsonTransactionIdentity(rows, nowIso);
    const existingDelivery = rows[index].deliveryAt;
    const deliveryAt = existingDelivery && new Date(existingDelivery) < new Date(nowIso) ? nowIso : existingDelivery;
    rows[index] = {
      ...rows[index],
      approvalStatus,
      transactionAt: nowIso,
      saleDate: transactionDateKey(nowIso),
      transactionDateKey: identity.transactionDateKey,
      transactionSequence: identity.transactionSequence,
      transactionNumber: identity.transactionNumber,
      deliveryAt
    };
  } else {
    rows[index] = { ...rows[index], approvalStatus };
  }
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
        stockReleaseStatus: erpCancellation?.stockReversalStatus === "reversed" || (before.stockReleaseStatus === "released" || before.stockReleaseStatus === "already_released") ? "reversed" : before.stockReleaseStatus,
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
    await reverseSalesJournals(id, { id: actor.id, name: actor.name, role: actor.role }, cleanReason).catch((err) => {
      console.warn(`[REVERSAL] Gagal membalik jurnal penjualan ${id}:`, err);
    });
    return after;
  });
}

function saleTotal(input: Pick<Sale, "items">) {
  return input.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - (item.discount || 0)), 0);
}

const rupiah = (val: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val || 0);

function calculateItemDeltas(beforeItems: Sale["items"], newItems: PenjualanInput["items"]) {
  const oldMap = new Map<string, number>();
  for (const item of beforeItems) {
    const key = `${item.productRef}::${item.warehouseId || "1"}`;
    oldMap.set(key, (oldMap.get(key) || 0) + Number(item.quantity || 0));
  }

  const deltaItems: Sale["items"] = [];
  const newMap = new Map<string, { item: PenjualanInput["items"][number]; totalQty: number }>();

  for (const item of newItems) {
    const key = `${item.productRef}::${item.warehouseId || "1"}`;
    const existing = newMap.get(key);
    if (existing) {
      existing.totalQty += Number(item.quantity || 0);
    } else {
      newMap.set(key, { item, totalQty: Number(item.quantity || 0) });
    }
  }

  newMap.forEach(({ item, totalQty }, key) => {
    const oldQty = oldMap.get(key) || 0;
    if (totalQty > oldQty) {
      deltaItems.push({
        ...item,
        quantity: totalQty - oldQty,
        unitPrice: item.unitPrice,
        discount: item.discount || 0
      } as Sale["items"][number]);
    }
  });

  return deltaItems;
}

async function updatePrismaSalesRecord(
  id: string,
  input: PenjualanInput,
  before: Sale,
  total: number,
  tipe: BookkeepingType,
  rekening: RekeningAccount | undefined,
  nextSyncStatus: Sale["syncStatus"],
  currentUser: { id: string; name: string; role: Role },
  stockOptions?: {
    approvalStatus?: Sale["approvalStatus"];
    stockReleaseStatus?: Sale["stockReleaseStatus"];
    stockReleaseReference?: string | null;
    stockReleasedAt?: Date | null;
  }
) {
  const rekeningNameSnapshot = rekeningSnapshotForUpdate(before, rekening);
  const row = await prisma.$transaction(async (tx) => {
    await tx.salesRecordItem.deleteMany({ where: { salesRecordId: id } });

    if (stockOptions?.approvalStatus !== "draft") {
      await syncTempoReceivableOnSalesEditInTransaction(
        tx,
        {
          salesId: id,
          tipeId: tipe.id,
          tipeCodeSnapshot: tipe.code,
          tipeNameSnapshot: tipe.name,
          customerName: input.customerName,
          total,
          saleDate: input.saleDate,
          dueDate: input.dueDate,
          paymentMethod: input.paymentMethod,
          initialPaymentAmount: input.initialPaymentAmount !== undefined ? input.initialPaymentAmount : before.initialPaymentAmount,
          initialPaymentMethod: input.initialPaymentMethod !== undefined ? input.initialPaymentMethod : before.initialPaymentMethod,
          initialPaymentRekeningId: input.initialPaymentRekeningId !== undefined ? input.initialPaymentRekeningId : before.initialPaymentRekeningId,
          initialPaymentRekeningNameSnapshot: input.initialPaymentRekeningNameSnapshot !== undefined ? input.initialPaymentRekeningNameSnapshot : before.initialPaymentRekeningNameSnapshot,
          initialPaymentNotes: input.initialPaymentNotes !== undefined ? input.initialPaymentNotes : before.initialPaymentNotes,
          syncTarget: before.syncTarget
        },
        currentUser
      );
    }

    const isFinalizingDraft = before.approvalStatus === "draft" && stockOptions?.approvalStatus === "approved";
    const dateKey = input.transactionAt ? transactionDateKey(input.transactionAt) : input.saleDate;
    let identityUpdate: {
      transactionDateKey?: string;
      transactionSequence?: number;
      transactionNumber?: string;
    } = {};
    if (input.transactionAt && (isFinalizingDraft || !before.transactionNumber)) {
      const allocated = await allocateTransactionIdentity(tx, input.transactionAt);
      identityUpdate = {
        transactionDateKey: allocated.transactionDateKey,
        transactionSequence: allocated.transactionSequence,
        transactionNumber: allocated.transactionNumber
      };
    }

    return tx.salesRecord.update({
      where: { id },
      data: {
        saleDate: new Date(input.saleDate),
        transactionAt: input.transactionAt ? new Date(input.transactionAt) : before.transactionAt ? new Date(before.transactionAt) : null,
        deliveryAt: input.deliveryAt ? new Date(input.deliveryAt) : null,
        ...identityUpdate,
        tipeId: tipe.id,
        tipeCodeSnapshot: tipe.code,
        tipeNameSnapshot: tipe.name,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerLocation: input.customerLocation,
        shippingMethod: input.shippingMethod,
        paymentMethod: input.paymentMethod,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        initialPaymentAmount: input.initialPaymentAmount !== undefined ? Number(input.initialPaymentAmount || 0) : before.initialPaymentAmount,
        initialPaymentMethod: input.initialPaymentMethod !== undefined ? input.initialPaymentMethod : before.initialPaymentMethod,
        initialPaymentRekeningId: input.initialPaymentRekeningId !== undefined ? input.initialPaymentRekeningId : before.initialPaymentRekeningId,
        initialPaymentRekeningNameSnapshot: input.initialPaymentRekeningNameSnapshot !== undefined ? input.initialPaymentRekeningNameSnapshot : before.initialPaymentRekeningNameSnapshot,
        initialPaymentNotes: input.initialPaymentNotes !== undefined ? input.initialPaymentNotes : before.initialPaymentNotes,
        rekeningId: rekening?.id,
        rekeningNameSnapshot,
        transferAccount: input.transferAccount,
        notes: input.notes,
        total,
        approvalStatus: stockOptions?.approvalStatus || before.approvalStatus || "approved",
        syncStatus: nextSyncStatus,
        syncError: before.syncTarget === "erp" ? "Transaksi diubah dan menunggu sinkronisasi ulang." : null,
        syncedAt: before.syncTarget === "erp" ? null : before.syncedAt ? new Date(before.syncedAt) : null,
        erpReference: before.erpReference || null,
        erpSyncHttpStatus: before.syncTarget === "erp" ? null : before.erpSyncHttpStatus,
        erpSyncResponse: before.syncTarget === "erp" ? undefined : before.erpSyncResponse === undefined ? undefined : serializeJson(before.erpSyncResponse),
        stockReleaseStatus: stockOptions?.stockReleaseStatus || before.stockReleaseStatus || "released",
        stockReleaseError: null,
        stockReleaseReference: stockOptions?.stockReleaseReference !== undefined ? stockOptions.stockReleaseReference : (before.stockReleaseReference || null),
        stockReleasedAt: stockOptions?.stockReleasedAt !== undefined ? stockOptions.stockReleasedAt : (before.stockReleasedAt ? new Date(before.stockReleasedAt) : null),
        stockReleaseHttpStatus: before.stockReleaseHttpStatus,
        stockReleaseResponse: before.stockReleaseResponse === undefined ? undefined : serializeJson(before.stockReleaseResponse),
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
            warehouseId: item.warehouseId || "1",
            warehouseNameSnapshot: item.warehouseNameSnapshot || "Gudang Utama",
            rackId: item.rackId,
            rackNameSnapshot: item.rackNameSnapshot,
            unitSnapshot: item.unitSnapshot || "Pcs",
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
  const isApproved = (stockOptions?.approvalStatus || before.approvalStatus) === "approved";
  if (isApproved) {
    await syncDeliveryOrderForSale(id).catch((err) => {
      console.error("[DO] Failed to sync delivery order on sales update:", err);
    });
  }
  return toSale(row);
}

export async function updateSalesRecord(id: string, input: PenjualanInput): Promise<Sale> {
  const before = await getSalesRecord(id);
  if (!before) throw Object.assign(new Error("Transaksi penjualan tidak ditemukan."), { code: "SALES_NOT_FOUND" });
  if (before.source === "MJ") throw Object.assign(new Error("Invoice MJ hanya dapat diubah melalui API integrasi MJ."), { code: "INVOICE_LOCKED" });
  assertSaleManageable(before);
  if (before.approvalStatus === "cancelled") {
    throw Object.assign(new Error("Transaksi yang sudah dibatalkan tidak dapat diedit."), { code: "TRANSACTION_CANCELLED" });
  }

  const isDraft = input.isDraft === true;
  const isKeepingDraft = before.approvalStatus === "draft" && isDraft;
  const isFinalizingDraft = before.approvalStatus === "draft" && !isDraft;

  const nowIso = new Date().toISOString();
  let transactionAt: string | undefined = input.transactionAt ? jakartaTimestampFromLocal(input.transactionAt) : before.transactionAt;
  if (isFinalizingDraft) {
    const isExplicitlyModified = Boolean(input.transactionAt && before.transactionAt && jakartaTimestampFromLocal(input.transactionAt) !== before.transactionAt);
    transactionAt = isExplicitlyModified ? jakartaTimestampFromLocal(input.transactionAt!) : nowIso;
  }
  let deliveryAt = input.deliveryAt === undefined ? before.deliveryAt : input.deliveryAt ? jakartaTimestampFromLocal(input.deliveryAt) : undefined;
  if (isFinalizingDraft && deliveryAt && transactionAt && deliveryAt < transactionAt) {
    deliveryAt = transactionAt;
  }
  if (deliveryAt && transactionAt && deliveryAt < transactionAt) throw new Error("Tanggal dan jam kirim tidak boleh sebelum waktu transaksi.");
  const computedSaleDate = transactionAt ? transactionDateKey(transactionAt) : input.saleDate;
  let dueDate = input.dueDate;
  if (isFinalizingDraft && dueDate && new Date(dueDate) < new Date(computedSaleDate)) {
    dueDate = computedSaleDate;
  }
  const normalizedInput: PenjualanInput = { ...input, transactionAt, deliveryAt, saleDate: computedSaleDate, dueDate };
  const total = saleTotal(normalizedInput);
  const tipe = await findTipe(normalizedInput.tipeId || before.tipeId);
  const rekening = await resolveRekeningForUpdate(before, normalizedInput, tipe);
  const rekeningNameSnapshot = rekeningSnapshotForUpdate(before, rekening);
  const nextSyncStatus = before.syncTarget === "erp" ? "pending" : "local";

  let newStockReference: string | null = before.stockReleaseReference || `SLM-STOCK-${before.erpReference || id}`;
  let stockReleaseStatus: Sale["stockReleaseStatus"] = before.stockReleaseStatus || "not_required";
  let stockReleasedAt: Date | null = before.stockReleasedAt ? new Date(before.stockReleasedAt) : null;
  const nextApprovalStatus: Sale["approvalStatus"] = isKeepingDraft ? "draft" : "approved";

  if (!isKeepingDraft) {
    if (before.stockReleaseReference && (before.stockReleaseStatus === "released" || before.stockReleaseStatus === "already_released")) {
      const cancelRes = await cancelStockRelease({
        reference: before.stockReleaseReference,
        reason: "Edit transaksi kasir SLM"
      });
      if (!cancelRes.success) {
        throw new Error(cancelRes.message || "Gagal membatalkan stok lama di ERP untuk revisi transaksi.");
      }
      newStockReference = nextRevisionReference(before.stockReleaseReference, `SLM-STOCK-${before.erpReference || id}`);
    }

    const stockResponse = await releaseSaleStock({
      saleId: id,
      saleDate: normalizedInput.saleDate,
      erpReference: newStockReference,
      sourceNumber: before.erpReference || `SLM-${id}`,
      items: normalizedInput.items,
    });
    if (!stockResponse.success) {
      throw new Error(stockResponse.message || "Stok di gudang tidak mencukupi untuk item transaksi hasil edit.");
    }
    stockReleaseStatus = before.syncTarget === "erp" && before.stockReleaseStatus === "pending"
      ? "pending"
      : stockResponse.data?.status === "already_released" ? "already_released" : "released";
    newStockReference = stockResponse.data?.releaseReference || newStockReference;
    stockReleasedAt = stockReleaseStatus === "pending" ? (before.stockReleasedAt ? new Date(before.stockReleasedAt) : null) : new Date();
  } else {
    stockReleaseStatus = "not_required";
    newStockReference = null;
    stockReleasedAt = null;
  }

  const currentUser = await getCurrentUser().catch(() => ({ id: "system", name: "System", role: "OWNER" as Role }));
  const stockOptions = {
    approvalStatus: nextApprovalStatus,
    stockReleaseStatus,
    stockReleaseReference: newStockReference,
    stockReleasedAt
  };

  const auditReason = isKeepingDraft
    ? "Perbarui draft penjualan SLM"
    : before.approvalStatus === "draft"
    ? `Finalisasi draft penjualan SLM • Stok AJ terpotong (${newStockReference})`
    : "Edit transaksi penjualan";

  if (isProductionMode()) {
    const after = await updatePrismaSalesRecord(id, normalizedInput, before, total, tipe, rekening, nextSyncStatus, currentUser, stockOptions);
    await recordAudit({
      entityType: "sales",
      entityId: id,
      action: "update",
      beforeValue: before,
      afterValue: after,
      reason: auditReason
    });
    return after;
  }

  const rows = await readJsonArray<Sale>(fileName);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) {
    const after = await updatePrismaSalesRecord(id, normalizedInput, before, total, tipe, rekening, nextSyncStatus, currentUser, stockOptions);
    await recordAudit({
      entityType: "sales",
      entityId: id,
      action: "update",
      beforeValue: before,
      afterValue: after,
      reason: auditReason
    });
    return after;
  }

  if (nextApprovalStatus !== "draft") {
    await syncTempoReceivableOnSalesEdit(
      {
        salesId: id,
        tipeId: tipe.id,
        tipeCodeSnapshot: tipe.code,
        tipeNameSnapshot: tipe.name,
        customerName: normalizedInput.customerName,
        total,
        saleDate: normalizedInput.saleDate,
        dueDate: normalizedInput.dueDate,
        paymentMethod: normalizedInput.paymentMethod,
        initialPaymentAmount: normalizedInput.initialPaymentAmount !== undefined ? normalizedInput.initialPaymentAmount : before.initialPaymentAmount,
        initialPaymentMethod: normalizedInput.initialPaymentMethod !== undefined ? normalizedInput.initialPaymentMethod : before.initialPaymentMethod,
        initialPaymentRekeningId: normalizedInput.initialPaymentRekeningId !== undefined ? normalizedInput.initialPaymentRekeningId : before.initialPaymentRekeningId,
        initialPaymentRekeningNameSnapshot: normalizedInput.initialPaymentRekeningNameSnapshot !== undefined ? normalizedInput.initialPaymentRekeningNameSnapshot : before.initialPaymentRekeningNameSnapshot,
        initialPaymentNotes: normalizedInput.initialPaymentNotes !== undefined ? normalizedInput.initialPaymentNotes : before.initialPaymentNotes,
        syncTarget: before.syncTarget
      },
      currentUser
    );
  }

  const identity = (isFinalizingDraft || !before.transactionNumber)
    ? nextJsonTransactionIdentity(rows, normalizedInput.transactionAt || nowIso)
    : {};

  const after: Sale = {
    ...before,
    ...normalizedInput,
    ...identity,
    tipeId: tipe.id,
    tipeCodeSnapshot: tipe.code,
    tipeNameSnapshot: tipe.name,
    rekeningId: rekening?.id,
    rekeningNameSnapshot,
    total,
    approvalStatus: nextApprovalStatus,
    syncStatus: nextSyncStatus,
    syncError: before.syncTarget === "erp" ? "Transaksi diubah dan menunggu sinkronisasi ulang." : undefined,
    syncedAt: before.syncTarget === "erp" ? undefined : before.syncedAt,
    erpReference: before.erpReference,
    erpSyncHttpStatus: before.syncTarget === "erp" ? undefined : before.erpSyncHttpStatus,
    erpSyncResponse: before.syncTarget === "erp" ? undefined : before.erpSyncResponse,
    stockReleaseStatus,
    stockReleaseError: undefined,
    stockReleaseReference: newStockReference || undefined,
    stockReleasedAt: stockReleasedAt ? stockReleasedAt.toISOString() : undefined,
    stockReleaseHttpStatus: before.stockReleaseHttpStatus,
    stockReleaseResponse: before.stockReleaseResponse,
    erpPaymentStatus: before.syncTarget === "erp" ? "pending" : before.erpPaymentStatus || "not_required",
    erpPaymentError: before.syncTarget === "erp" ? "Menunggu update invoice ERP dan release stok ulang sebelum payment ERP." : before.erpPaymentError,
    erpPaymentReference: before.syncTarget === "erp" ? undefined : before.erpPaymentReference,
    erpPaymentSyncedAt: before.syncTarget === "erp" ? undefined : before.erpPaymentSyncedAt,
    erpPaymentAttemptedAt: before.syncTarget === "erp" ? undefined : before.erpPaymentAttemptedAt
  };
  rows[index] = after;
  await writeJsonArray(fileName, rows);
  if (isFinalizingDraft) {
    await syncDeliveryOrderForSale(id).catch((err) => {
      console.error("[DO] Failed to create delivery order on json draft finalization:", err);
    });
  }
  await recordAudit({
    entityType: "sales",
    entityId: id,
    action: "update",
    beforeValue: before,
    afterValue: after,
    reason: auditReason
  });
  return after;
}

export async function cancelSalesRecord(id: string, reason: string): Promise<Sale> {
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("Alasan cancel wajib diisi.");
  const before = await getSalesRecord(id);
  if (!before) throw new Error("Transaksi penjualan tidak ditemukan.");
  if (before.source === "MJ") throw new Error("Cancel invoice MJ menunggu kontrak cancel/reversal AJ dan tidak boleh mengubah status lokal.");
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
  } else if (before.stockReleaseReference && (before.stockReleaseStatus === "released" || before.stockReleaseStatus === "already_released")) {
    // Alur 3: Batalkan rilis stok di AJ jika transaksi kasir dibatalkan/void
    await cancelStockRelease({
      reference: before.stockReleaseReference,
      reason: cleanReason
    });
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

export async function recordSalesPrintLog(
  id: string,
  printedBy: string,
): Promise<{ isPrinted: boolean; printedBy: string; printedAt: string; printCount: number } | null> {
  const cleanPrintedBy = printedBy.trim();
  if (!cleanPrintedBy) return null;

  const printedAt = new Date().toISOString();

  if (isProductionMode()) {
    const row = await prisma.salesRecord.findUnique({
      where: { id },
      select: { id: true, integrationMetadata: true },
    });
    if (!row) return null;

    const existingMetadata = (row.integrationMetadata as Record<string, unknown>) || {};
    const existingCount = typeof existingMetadata.print_count === "number"
      ? existingMetadata.print_count
      : existingMetadata.is_printed ? 1 : 0;
    const printCount = existingCount + 1;

    const updatedMetadata = {
      ...existingMetadata,
      is_printed: true,
      printed_by: cleanPrintedBy,
      printed_at: printedAt,
      print_count: printCount,
    };

    await prisma.salesRecord.update({
      where: { id },
      data: {
        integrationMetadata: updatedMetadata,
      },
    });

    return {
      isPrinted: true,
      printedBy: cleanPrintedBy,
      printedAt,
      printCount,
    };
  }

  const rows = await readJsonArray<Sale>(fileName);
  const index = rows.findIndex((r) => r.id === id);
  if (index >= 0) {
    const current = rows[index];
    const printCount = (current.printCount || (current.isPrinted ? 1 : 0)) + 1;
    const updated: Sale = {
      ...current,
      isPrinted: true,
      printedBy: cleanPrintedBy,
      printedAt,
      printCount,
    };
    rows[index] = updated;
    await writeJsonArray(fileName, rows);
    return {
      isPrinted: true,
      printedBy: cleanPrintedBy,
      printedAt,
      printCount,
    };
  }

  return null;
}

