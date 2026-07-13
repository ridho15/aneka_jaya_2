import "server-only";
import { readJsonArray, writeJsonArray } from "@/lib/data/jsonStore";
import type { Sale } from "@/lib/types/sales";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/auth/roles";
import type { Prisma } from "@prisma/client";
import type { PenjualanInput } from "@/lib/validation/penjualanSchema";
import { recordAudit } from "@/lib/audit/store";
import { findTipe, resolveSalesRekening } from "@/lib/business/masterData";

const fileName = "sales-records.json";
const isProductionMode = () => process.env.NEXT_PUBLIC_APP_MODE === "production";
const salesInclude = { items: { orderBy: { sortOrder: "asc" as const } } };

function serializeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
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
  stockReleaseStatus: string;
  stockReleaseError: string | null;
  stockReleaseReference: string | null;
  stockReleasedAt: Date | null;
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
  approvalStatus?: string;
  syncStatus?: string;
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

function buildSalesWhere(filters: SalesRecordFilters): Prisma.SalesRecordWhereInput {
  const where: Prisma.SalesRecordWhereInput = {};
  if (filters.from || filters.to) {
    where.saleDate = {};
    if (filters.from) where.saleDate.gte = dateStart(filters.from);
    if (filters.to) where.saleDate.lte = dateEnd(filters.to);
  }
  if (filters.tipe) where.OR = [{ tipeCodeSnapshot: filters.tipe }, { tipeId: filters.tipe }];
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.approvalStatus) where.approvalStatus = filters.approvalStatus;
  if (filters.syncStatus) where.syncStatus = filters.syncStatus;
  const keyword = filters.keyword?.trim();
  if (keyword) {
    const keywordOr: Prisma.SalesRecordWhereInput[] = [
      { id: { contains: keyword, mode: "insensitive" } },
      { customerName: { contains: keyword, mode: "insensitive" } },
      { customerLocation: { contains: keyword, mode: "insensitive" } },
      { testReference: { contains: keyword, mode: "insensitive" } },
      { erpReference: { contains: keyword, mode: "insensitive" } },
      { createdByNameSnapshot: { contains: keyword, mode: "insensitive" } }
    ];
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: keywordOr }];
  }
  return where;
}

function filterSalesInMemory(sales: Sale[], filters: SalesRecordFilters) {
  const keyword = filters.keyword?.trim().toLowerCase();
  return sales.filter((sale) => {
    if (filters.from && sale.saleDate < filters.from) return false;
    if (filters.to && sale.saleDate > filters.to) return false;
    if (filters.tipe && (sale.tipeCodeSnapshot || sale.tipeId || "") !== filters.tipe) return false;
    if (filters.paymentMethod && sale.paymentMethod !== filters.paymentMethod) return false;
    if (filters.approvalStatus && (sale.approvalStatus || "approved") !== filters.approvalStatus) return false;
    if (filters.syncStatus && (sale.syncStatus || "local") !== filters.syncStatus) return false;
    if (keyword) {
      const haystack = [sale.id, sale.customerName, sale.customerLocation, sale.testReference, sale.erpReference, sale.createdByNameSnapshot].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function toSale(row: SalesRecordWithItems): Sale {
  return {
    id: row.id,
    saleDate: row.saleDate.toISOString().slice(0, 10),
    tipeId: row.tipeId,
    tipeCodeSnapshot: row.tipeCodeSnapshot,
    tipeNameSnapshot: row.tipeNameSnapshot,
    customerName: row.customerName,
    customerLocation: row.customerLocation || undefined,
    shippingMethod: row.shippingMethod || undefined,
    paymentMethod: row.paymentMethod as Sale["paymentMethod"],
    dueDate: row.dueDate?.toISOString().slice(0, 10),
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
    stockReleaseStatus: row.stockReleaseStatus as Sale["stockReleaseStatus"],
    stockReleaseError: row.stockReleaseError || undefined,
    stockReleaseReference: row.stockReleaseReference || undefined,
    stockReleasedAt: row.stockReleasedAt?.toISOString(),
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
    saleDate: row.saleDate.toISOString().slice(0, 10),
    tipeId: row.tipeId,
    tipeCodeSnapshot: row.tipeCodeSnapshot,
    tipeNameSnapshot: row.tipeNameSnapshot,
    customerName: row.customerName,
    customerLocation: row.customerLocation || undefined,
    shippingMethod: row.shippingMethod || undefined,
    paymentMethod: row.paymentMethod as Sale["paymentMethod"],
    dueDate: row.dueDate?.toISOString().slice(0, 10),
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
    stockReleaseStatus: row.stockReleaseStatus as Sale["stockReleaseStatus"],
    stockReleaseError: row.stockReleaseError || undefined,
    stockReleaseReference: row.stockReleaseReference || undefined,
    stockReleasedAt: row.stockReleasedAt?.toISOString(),
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

export async function listSalesRecordsPage(input: { page?: number; pageSize?: number; filters?: SalesRecordFilters } = {}): Promise<PaginatedSalesRecords> {
  const page = cleanPage(input.page);
  const pageSize = cleanPageSize(input.pageSize);
  if (isProductionMode()) {
    const where = buildSalesWhere(input.filters || {});
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
  const filtered = filterSalesInMemory(await listSalesRecords(), input.filters || {});
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

export async function saveSalesRecord(sale: Sale): Promise<void> {
  if (isProductionMode()) {
    await prisma.salesRecord.create({
      data: {
        id: sale.id,
        saleDate: new Date(sale.saleDate),
        tipeId: sale.tipeId || "W",
        tipeCodeSnapshot: sale.tipeCodeSnapshot || "W",
        tipeNameSnapshot: sale.tipeNameSnapshot || "W",
        customerName: sale.customerName,
        customerLocation: sale.customerLocation,
        shippingMethod: sale.shippingMethod,
        paymentMethod: sale.paymentMethod,
        dueDate: sale.dueDate ? new Date(sale.dueDate) : undefined,
        rekeningId: sale.rekeningId,
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
        stockReleaseStatus: sale.stockReleaseStatus || "not_required",
        stockReleaseError: sale.stockReleaseError,
        stockReleaseReference: sale.stockReleaseReference,
        stockReleasedAt: sale.stockReleasedAt ? new Date(sale.stockReleasedAt) : undefined,
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
    return;
  }
  const rows = await readJsonArray<Sale>(fileName);
  rows.unshift(sale);
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
  if (sale.syncTarget === "erp" && sale.syncStatus === "synced") {
    throw new Error("Transaksi AJ yang sudah tersinkron ERP tidak bisa diubah langsung. Buat koreksi melalui ERP atau mekanisme koreksi resmi.");
  }
}

function saleTotal(input: Pick<Sale, "items">) {
  return input.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice - (item.discount || 0)), 0);
}

export async function updateSalesRecord(id: string, input: PenjualanInput): Promise<Sale> {
  const before = await getSalesRecord(id);
  if (!before) throw new Error("Transaksi penjualan tidak ditemukan.");
  assertSaleManageable(before);
  const total = saleTotal(input);
  const tipe = await findTipe(input.tipeId || before.tipeId);
  const rekening = await resolveSalesRekening(input.paymentMethod, tipe.id, input.rekeningId);
  const nextSyncStatus = before.syncTarget === "erp" ? "pending" : "local";
  if (isProductionMode()) {
    const row = await prisma.$transaction(async (tx) => {
      await tx.salesRecordItem.deleteMany({ where: { salesRecordId: id } });
      return tx.salesRecord.update({
        where: { id },
        data: {
          saleDate: new Date(input.saleDate),
          tipeId: tipe.id,
          tipeCodeSnapshot: tipe.code,
          tipeNameSnapshot: tipe.name,
          customerName: input.customerName,
          customerLocation: input.customerLocation,
          shippingMethod: input.shippingMethod,
          paymentMethod: input.paymentMethod,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          rekeningId: rekening?.id,
          transferAccount: input.transferAccount,
          notes: input.notes,
          total,
          syncStatus: nextSyncStatus,
          syncError: before.syncTarget === "erp" ? "Transaksi diubah dan menunggu sinkronisasi ulang." : null,
          syncedAt: before.syncTarget === "erp" ? null : before.syncedAt ? new Date(before.syncedAt) : null,
          stockReleaseStatus: before.syncTarget === "erp" ? "pending" : before.stockReleaseStatus || "not_required",
          stockReleaseError: before.syncTarget === "erp" ? "Transaksi diubah dan menunggu release stok ulang." : before.stockReleaseError || null,
          stockReleaseReference: before.syncTarget === "erp" ? null : before.stockReleaseReference || null,
          stockReleasedAt: before.syncTarget === "erp" ? null : before.stockReleasedAt ? new Date(before.stockReleasedAt) : null,
          erpPaymentStatus: before.syncTarget === "erp" ? "pending" : before.erpPaymentStatus || "not_required",
          erpPaymentError: before.syncTarget === "erp" ? "Transaksi diubah dan menunggu payment ERP ulang." : before.erpPaymentError || null,
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
    const after = toSale(row);
    await recordAudit({ entityType: "sales", entityId: id, action: "update", beforeValue: before, afterValue: after, reason: before.syncTarget === "erp" ? "Edit transaksi ERP belum synced • masuk antrian sync ulang" : "Edit transaksi lokal" });
    return after;
  }
  const rows = await readJsonArray<Sale>(fileName);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error("Transaksi penjualan tidak ditemukan.");
  const after: Sale = { ...before, ...input, tipeId: tipe.id, tipeCodeSnapshot: tipe.code, tipeNameSnapshot: tipe.name, rekeningId: rekening?.id, rekeningNameSnapshot: rekening?.name, total, syncStatus: nextSyncStatus, syncError: before.syncTarget === "erp" ? "Transaksi diubah dan menunggu sinkronisasi ulang." : undefined, stockReleaseStatus: before.syncTarget === "erp" ? "pending" : before.stockReleaseStatus || "not_required", stockReleaseError: before.syncTarget === "erp" ? "Transaksi diubah dan menunggu release stok ulang." : before.stockReleaseError, stockReleaseReference: before.syncTarget === "erp" ? undefined : before.stockReleaseReference, stockReleasedAt: before.syncTarget === "erp" ? undefined : before.stockReleasedAt, erpPaymentStatus: before.syncTarget === "erp" ? "pending" : before.erpPaymentStatus || "not_required", erpPaymentError: before.syncTarget === "erp" ? "Transaksi diubah dan menunggu payment ERP ulang." : before.erpPaymentError, erpPaymentReference: before.syncTarget === "erp" ? undefined : before.erpPaymentReference, erpPaymentSyncedAt: before.syncTarget === "erp" ? undefined : before.erpPaymentSyncedAt, erpPaymentAttemptedAt: before.syncTarget === "erp" ? undefined : before.erpPaymentAttemptedAt };
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
  assertSaleManageable(before);
  if (isProductionMode()) {
    const row = await prisma.salesRecord.update({
      where: { id },
      data: {
        approvalStatus: "cancelled",
        syncStatus: before.syncTarget === "erp" ? "failed" : before.syncStatus || "local",
        syncError: before.syncTarget === "erp" ? "Transaksi dibatalkan sebelum berhasil tersinkron ERP." : before.syncError
      },
      include: salesInclude
    });
    const after = toSale(row);
    await recordAudit({ entityType: "sales", entityId: id, action: "cancel", beforeValue: before, afterValue: after, reason: cleanReason });
    return after;
  }
  const rows = await readJsonArray<Sale>(fileName);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error("Transaksi penjualan tidak ditemukan.");
  const after: Sale = { ...before, approvalStatus: "cancelled", syncStatus: before.syncTarget === "erp" ? "failed" : before.syncStatus, syncError: before.syncTarget === "erp" ? "Transaksi dibatalkan sebelum berhasil tersinkron ERP." : before.syncError };
  rows[index] = after;
  await writeJsonArray(fileName, rows);
  await recordAudit({ entityType: "sales", entityId: id, action: "cancel", beforeValue: before, afterValue: after, reason: cleanReason });
  return after;
}
