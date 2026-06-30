import "server-only";
import { readJsonArray, writeJsonArray } from "@/lib/data/jsonStore";
import type { Sale } from "@/lib/types/sales";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/auth/roles";
import type { Prisma } from "@prisma/client";
import type { PenjualanInput } from "@/lib/validation/penjualanSchema";
import { recordAudit } from "@/lib/audit/store";

const fileName = "sales-records.json";
const isProductionMode = () => process.env.NEXT_PUBLIC_APP_MODE === "production";
const salesInclude = { items: { orderBy: { sortOrder: "asc" as const } } };

type SalesRecordWithItems = Prisma.SalesRecordGetPayload<{ include: typeof salesInclude }>;

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
    testReference: row.testReference || undefined,
    isTestTransaction: row.isTestTransaction,
    createdByUserId: row.createdByUserId,
    createdByNameSnapshot: row.createdByNameSnapshot,
    createdByRoleSnapshot: row.createdByRoleSnapshot,
    createdAt: row.createdAt.toISOString(),
    items: row.items.map((item) => ({
      productRef: item.productRef,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount)
    }))
  };
}

export async function listSalesRecords(): Promise<Sale[]> {
  if (isProductionMode()) {
    const rows = await prisma.salesRecord.findMany({ include: salesInclude, orderBy: { createdAt: "desc" } });
    return rows.map(toSale);
  }
  const rows = await readJsonArray<Sale>(fileName);
  return rows;
}

export async function getSalesRecord(id: string): Promise<Sale | undefined> {
  if (isProductionMode()) {
    const row = await prisma.salesRecord.findUnique({ where: { id }, include: salesInclude });
    return row ? toSale(row) : undefined;
  }
  return (await listSalesRecords()).find((sale) => sale.id === id);
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
  const nextSyncStatus = before.syncTarget === "erp" ? "pending" : "local";
  if (isProductionMode()) {
    const row = await prisma.$transaction(async (tx) => {
      await tx.salesRecordItem.deleteMany({ where: { salesRecordId: id } });
      return tx.salesRecord.update({
        where: { id },
        data: {
          saleDate: new Date(input.saleDate),
          tipeId: input.tipeId || before.tipeId || "W",
          tipeCodeSnapshot: input.tipeCodeSnapshot || before.tipeCodeSnapshot || "W",
          tipeNameSnapshot: input.tipeNameSnapshot || before.tipeNameSnapshot || "W",
          customerName: input.customerName,
          customerLocation: input.customerLocation,
          shippingMethod: input.shippingMethod,
          paymentMethod: input.paymentMethod,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          rekeningId: input.rekeningId,
          transferAccount: input.transferAccount,
          notes: input.notes,
          total,
          syncStatus: nextSyncStatus,
          syncError: before.syncTarget === "erp" ? "Transaksi diubah dan menunggu sinkronisasi ulang." : null,
          syncedAt: before.syncTarget === "erp" ? null : before.syncedAt ? new Date(before.syncedAt) : null,
          items: {
            create: input.items.map((item, index) => ({
              id: `${id}-item-${Date.now()}-${index}`,
              productRef: item.productRef,
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
  const after: Sale = { ...before, ...input, total, syncStatus: nextSyncStatus, syncError: before.syncTarget === "erp" ? "Transaksi diubah dan menunggu sinkronisasi ulang." : undefined };
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
