import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth/session";
import type {
  DeliveryOrderData,
  DeliveryOrderItemData,
  DeliveryOrderQueueItem,
  DeliveryOrderStatus,
  PackingStatus,
  ShippingStatus
} from "./types";
import { recordAudit } from "@/lib/audit/store";
import { parseReceiptPhotos } from "./photos";

export type ListDeliveryOrdersFilter = {
  status?: string;
  packingStatus?: string;
  shippingStatus?: string;
  assignedUserId?: string;
  search?: string;
};

export type DeliveryOrderShippedSnapshot = {
  productRef: string;
  quantity: unknown;
  isShipped: boolean;
  shippedQuantity: unknown;
  shippedAt: Date | null;
};

/**
 * Ambil status kirim item DO sebelum item penjualan dihapus saat invoice diedit.
 * Item DO ikut terhapus (cascade), sehingga status ini harus disimpan lebih dulu.
 */
export async function snapshotDeliveryOrderShippedItems(
  tx: Prisma.TransactionClient,
  saleId: string
): Promise<DeliveryOrderShippedSnapshot[]> {
  if (!tx?.deliveryOrderItem?.findMany) return [];
  const rows = await tx.deliveryOrderItem.findMany({
    where: { deliveryOrder: { salesRecordId: saleId }, isShipped: true },
    select: { productRef: true, quantity: true, isShipped: true, shippedQuantity: true, shippedAt: true }
  });
  return Array.isArray(rows) ? rows : [];
}

export async function syncDeliveryOrderForSale(
  saleId: string,
  customTx?: Prisma.TransactionClient,
  options: { previousShipped?: DeliveryOrderShippedSnapshot[] } = {}
) {
  const runner = async (tx: Prisma.TransactionClient) => {
    if (!tx?.deliveryOrder || !tx?.salesRecord) return null;

    let sale = await tx.salesRecord.findUnique({
      where: { id: saleId },
      include: { items: { orderBy: { sortOrder: "asc" } } }
    });

    // Fallback: If not in Prisma yet, attempt reading from local json store (for dev mode or legacy data)
    if (!sale) {
      try {
        const { readJsonArray } = await import("@/lib/data/jsonStore");
        const jsonRows = await readJsonArray<any>("sales-records.json");
        const jsonSale = jsonRows.find((r: any) => r.id === saleId);
        if (jsonSale) {
          const items = Array.isArray(jsonSale.items) ? jsonSale.items : [];
          if (tx.salesRecord.upsert) {
            sale = await tx.salesRecord.upsert({
              where: { id: jsonSale.id },
              create: {
                id: jsonSale.id,
                saleDate: jsonSale.saleDate ? new Date(jsonSale.saleDate) : new Date(),
                transactionNumber: jsonSale.transactionNumber || null,
                transactionAt: jsonSale.transactionAt ? new Date(jsonSale.transactionAt) : null,
                transactionSequence: jsonSale.transactionSequence || null,
                transactionDateKey: jsonSale.transactionDateKey || null,
                deliveryAt: jsonSale.deliveryAt ? new Date(jsonSale.deliveryAt) : null,
                tipeId: jsonSale.tipeId || "W",
                tipeCodeSnapshot: jsonSale.tipeCodeSnapshot || "W",
                tipeNameSnapshot: jsonSale.tipeNameSnapshot || "Walk In",
                customerName: jsonSale.customerName || "Customer",
                customerPhone: jsonSale.customerPhone || null,
                customerLocation: jsonSale.customerLocation || null,
                shippingMethod: jsonSale.shippingMethod || null,
                paymentMethod: jsonSale.paymentMethod || "Cash",
                dueDate: jsonSale.dueDate ? new Date(jsonSale.dueDate) : null,
                total: jsonSale.total || 0,
                approvalStatus: jsonSale.approvalStatus || "approved",
                source: jsonSale.source || "SLM",
                createdByUserId: jsonSale.createdByUserId || "legacy",
                createdByNameSnapshot: jsonSale.createdByNameSnapshot || "Legacy",
                createdByRoleSnapshot: jsonSale.createdByRoleSnapshot || "OWNER",
                createdAt: jsonSale.createdAt ? new Date(jsonSale.createdAt) : new Date(),
                items: {
                  create: items.map((it: any, idx: number) => ({
                    id: `${jsonSale.id}-item-${idx}`,
                    productRef: it.productRef || "ITEM",
                    productId: it.productId ? String(it.productId) : null,
                    manualProduct: it.manualProduct ? JSON.stringify(it.manualProduct) : undefined,
                    warehouseId: it.warehouseId || "1",
                    warehouseNameSnapshot: it.warehouseNameSnapshot || "Gudang Utama",
                    rackId: it.rackId ? String(it.rackId) : null,
                    rackNameSnapshot: it.rackNameSnapshot || null,
                    unitSnapshot: it.unitSnapshot || "Pcs",
                    quantity: it.quantity || 1,
                    unitPrice: it.unitPrice || 0,
                    discount: it.discount || 0,
                    sortOrder: idx
                  }))
                }
              },
              update: {},
              include: { items: { orderBy: { sortOrder: "asc" } } }
            });
          }
        }
      } catch (err) {
        console.error("[DO Sync] Fallback to jsonStore failed:", err);
      }
    }

    if (!sale) {
      throw new Error(`Sales record dengan ID ${saleId} tidak ditemukan.`);
    }

    const existing = await tx.deliveryOrder.findUnique({
      where: { salesRecordId: saleId },
      include: { items: true }
    });

    const doNumber = sale.transactionNumber
      ? `DO-${sale.transactionNumber}`
      : `DO-${saleId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()}`;

    const itemsToCreate = (sale.items || []).map((item) => {
      let productName = item.productRef;
      if (item.manualProduct) {
        try {
          const parsed = typeof item.manualProduct === "string"
            ? JSON.parse(item.manualProduct)
            : item.manualProduct;
          if (parsed && typeof parsed === "object" && "name" in parsed && typeof parsed.name === "string") {
            productName = parsed.name;
          }
        } catch {
          // fallback to productRef
        }
      }

      return {
        salesRecordItemId: item.id,
        productRef: item.productRef,
        productNameSnapshot: productName,
        warehouseNameSnapshot: item.warehouseNameSnapshot || undefined,
        rackNameSnapshot: item.rackNameSnapshot || undefined,
        unitSnapshot: item.unitSnapshot || "Pcs",
        quantity: item.quantity,
        isShipped: false,
        shippedQuantity: 0
      };
    });

    let targetDo = existing;

    if (!targetDo) {
      targetDo = await tx.deliveryOrder.create({
        data: {
          doNumber,
          salesRecordId: sale.id,
          status: "belum_selesai",
          packingStatus: "belum",
          shippingStatus: "belum",
          items: {
            create: itemsToCreate
          }
        },
        include: { items: true }
      });
    } else {
      // Reconcile items if existing has 0 items or needs synchronization
      const currentItems = targetDo.items || [];
      const hasMissingItems = currentItems.length === 0 && itemsToCreate.length > 0;
      const salesItemIds = new Set((sale.items || []).map((i) => i.id));
      const hasStaleItems = currentItems.some((i) => !salesItemIds.has(i.salesRecordItemId));

      if (hasMissingItems || hasStaleItems) {
        const shippedMap = new Map<string, { quantity: number; isShipped: boolean; shippedQuantity: any; shippedAt: any }>();
        for (const ci of [...(options.previousShipped || []), ...currentItems]) {
          if (ci.isShipped) {
            shippedMap.set(ci.productRef, {
              quantity: Number(ci.quantity),
              isShipped: ci.isShipped,
              shippedQuantity: ci.shippedQuantity,
              shippedAt: ci.shippedAt
            });
          }
        }

        if (tx.deliveryOrderItem?.deleteMany) {
          await tx.deliveryOrderItem.deleteMany({
            where: { deliveryOrderId: targetDo.id }
          });
        }

        for (const itm of itemsToCreate) {
          const prev = shippedMap.get(itm.productRef);
          // Jangan anggap terkirim bila jumlahnya dinaikkan melebihi yang sudah dikirim.
          const prevShipped = prev && Number(itm.quantity) <= prev.quantity ? prev : undefined;
          if (tx.deliveryOrderItem?.create) {
            await tx.deliveryOrderItem.create({
              data: {
                deliveryOrderId: targetDo.id,
                ...itm,
                isShipped: prevShipped?.isShipped ?? false,
                shippedQuantity: prevShipped?.shippedQuantity ?? 0,
                shippedAt: prevShipped?.shippedAt ?? null
              }
            });
          }
        }

        if (tx.deliveryOrder?.findUnique) {
          targetDo = await tx.deliveryOrder.findUnique({
            where: { id: targetDo.id },
            include: { items: true }
          }) || targetDo;
        }
      }
    }

    const items = Array.isArray(targetDo?.items)
      ? targetDo.items
      : Array.isArray((targetDo as any)?.items?.create)
      ? (targetDo as any).items.create
      : [];
    const totalCount = items.length;
    const shippedCount = items.filter((i: any) => i?.isShipped).length;

    let nextStatus = targetDo?.status || "belum_selesai";
    let nextShipping = targetDo?.shippingStatus || "belum";

    if (totalCount > 0 && shippedCount === totalCount) {
      nextStatus = "selesai";
      nextShipping = "sudah";
    } else if (shippedCount > 0) {
      nextStatus = "selesai_setengah";
    }

    if (existing && tx.deliveryOrder?.update) {
      const updatedDo = await tx.deliveryOrder.update({
        where: { id: targetDo.id },
        data: {
          status: nextStatus,
          shippingStatus: nextShipping
        },
        include: { items: true }
      });
      if (updatedDo) {
        targetDo = updatedDo;
      }
    }

    // Sync denormalized status to SalesRecord
    await tx.salesRecord.update({
      where: { id: sale.id },
      data: {
        doStatus: nextStatus,
        doPackingStatus: targetDo?.packingStatus || "belum",
        doShippingStatus: nextShipping
      }
    });

    return targetDo;
  };

  if (customTx) {
    return runner(customTx);
  }
  return prisma.$transaction(runner);
}

export async function createDeliveryOrderForSale(saleId: string, customTx?: Prisma.TransactionClient) {
  return syncDeliveryOrderForSale(saleId, customTx);
}

export type ListDeliveryOrdersPageParams = {
  page?: number;
  pageSize?: number;
  filters?: ListDeliveryOrdersFilter;
};

export type DeliveryOrderPageResult = {
  data: DeliveryOrderQueueItem[];
  meta: {
    total: number;
    totalPages: number;
    page: number;
    pageSize: number;
  };
};

function buildDeliveryOrderWhere(
  filters: ListDeliveryOrdersFilter = {},
  user?: CurrentUser
): Prisma.DeliveryOrderWhereInput {
  const andConditions: Prisma.DeliveryOrderWhereInput[] = [];

  // Hide DO yang sudah selesai dari non-super admin (hanya OWNER yang boleh melihat)
  if (!user || user.role !== "OWNER") {
    andConditions.push({
      status: { not: "selesai" }
    });
  }

  if (filters.status && filters.status !== "all") {
    andConditions.push({ status: filters.status });
  }
  if (filters.packingStatus && filters.packingStatus !== "all") {
    andConditions.push({ packingStatus: filters.packingStatus });
  }
  if (filters.shippingStatus && filters.shippingStatus !== "all") {
    andConditions.push({ shippingStatus: filters.shippingStatus });
  }

  if (filters.assignedUserId) {
    if (filters.assignedUserId === "unassigned") {
      andConditions.push({
        assignedUserId: null,
        assignees: { none: {} }
      });
    } else if (filters.assignedUserId !== "all") {
      andConditions.push({
        OR: [
          { assignedUserId: filters.assignedUserId },
          { assignees: { some: { userId: filters.assignedUserId } } }
        ]
      });
    }
  }

  if (filters.search) {
    const s = filters.search.trim();
    andConditions.push({
      OR: [
        { doNumber: { contains: s, mode: "insensitive" } },
        { salesRecord: { customerName: { contains: s, mode: "insensitive" } } },
        { salesRecord: { transactionNumber: { contains: s, mode: "insensitive" } } },
        { salesRecord: { customerLocation: { contains: s, mode: "insensitive" } } },
        { salesRecord: { shippingMethod: { contains: s, mode: "insensitive" } } }
      ]
    });
  }

  if (andConditions.length === 0) return {};
  if (andConditions.length === 1) return andConditions[0];
  return { AND: andConditions };
}

function mapDeliveryOrderQueueItem(row: any): DeliveryOrderQueueItem {
  const assignees = Array.isArray(row.assignees)
    ? row.assignees.map((a: any) => ({
        id: a.id,
        userId: a.userId,
        userName: a.userName,
        assignedAt: a.assignedAt instanceof Date ? a.assignedAt.toISOString() : String(a.assignedAt || "")
      }))
    : [];

  return {
    id: row.id,
    doNumber: row.doNumber,
    salesRecordId: row.salesRecordId,
    transactionNumber: row.salesRecord?.transactionNumber || undefined,
    saleDate: row.salesRecord?.saleDate ? row.salesRecord.saleDate.toISOString() : row.createdAt.toISOString(),
    customerName: row.salesRecord?.customerName || "Customer",
    customerLocation: row.salesRecord?.customerLocation || undefined,
    shippingMethod: row.salesRecord?.shippingMethod || undefined,
    deliveryAt: row.salesRecord?.deliveryAt ? row.salesRecord.deliveryAt.toISOString() : undefined,
    status: row.status as DeliveryOrderStatus,
    packingStatus: row.packingStatus as PackingStatus,
    shippingStatus: row.shippingStatus as ShippingStatus,
    assignedUserId: row.assignedUserId || assignees[0]?.userId || undefined,
    assignedUserName: row.assignedUserName || assignees[0]?.userName || undefined,
    assignedOfficers: assignees.length > 0
      ? assignees
      : row.assignedUserId
      ? [{
          id: row.assignedUserId,
          userId: row.assignedUserId,
          userName: row.assignedUserName || "Petugas DO",
          assignedAt: row.assignedAt ? row.assignedAt.toISOString() : row.createdAt.toISOString()
        }]
      : [],
    totalItemsCount: row.items ? row.items.length : 0,
    shippedItemsCount: row.items ? row.items.filter((i: any) => i.isShipped).length : 0,
    receiptPhotoUrl: row.receiptPhotoUrl || undefined,
    createdAt: row.createdAt.toISOString()
  };
}

export async function listDeliveryOrdersPage(
  params: ListDeliveryOrdersPageParams = {},
  user?: CurrentUser
): Promise<DeliveryOrderPageResult> {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const where = buildDeliveryOrderWhere(params.filters, user);

  const [total, rows] = await Promise.all([
    prisma.deliveryOrder.count({ where }),
    prisma.deliveryOrder.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        salesRecord: {
          select: {
            transactionNumber: true,
            saleDate: true,
            customerName: true,
            customerLocation: true,
            shippingMethod: true,
            deliveryAt: true
          }
        },
        items: {
          select: {
            id: true,
            isShipped: true
          }
        },
        assignees: true
      }
    })
  ]);

  const totalPages = Math.ceil(total / pageSize) || 1;
  return {
    data: rows.map(mapDeliveryOrderQueueItem),
    meta: {
      total,
      totalPages,
      page,
      pageSize
    }
  };
}

export async function listDeliveryOrders(
  filters: ListDeliveryOrdersFilter = {},
  user?: CurrentUser
): Promise<DeliveryOrderQueueItem[]> {
  const where = buildDeliveryOrderWhere(filters, user);

  const rows = await prisma.deliveryOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      salesRecord: {
        select: {
          transactionNumber: true,
          saleDate: true,
          customerName: true,
          customerLocation: true,
          shippingMethod: true,
          deliveryAt: true
        }
      },
      items: {
        select: {
          id: true,
          isShipped: true
        }
      },
      assignees: true
    }
  });

  return rows.map(mapDeliveryOrderQueueItem);
}

export async function getDeliveryOrderDetail(
  id: string,
  user?: CurrentUser
): Promise<DeliveryOrderData | null> {
  const row = await prisma.deliveryOrder.findFirst({
    where: { OR: [{ id }, { salesRecordId: id }, { doNumber: id }] },
    include: {
      salesRecord: {
        select: {
          id: true,
          transactionNumber: true,
          saleDate: true,
          customerName: true,
          customerLocation: true,
          shippingMethod: true,
          deliveryAt: true,
          source: true,
          createdByUserId: true
        }
      },
      // Ikuti urutan item di invoice penjualan. Item DO dibuat ulang saat invoice diedit,
      // sehingga tanpa orderBy PostgreSQL bisa mengembalikan urutan acak.
      items: {
        orderBy: [{ salesRecordItem: { sortOrder: "asc" } }, { id: "asc" }]
      },
      assignees: true
    }
  });

  if (!row) return null;

  // Sembunyikan DO yang sudah selesai dari non-Super Admin (hanya OWNER yang boleh melihat)
  if ((!user || user.role !== "OWNER") && row.status === "selesai") {
    return null;
  }

  const assignedOfficers = (row.assignees && row.assignees.length > 0)
    ? row.assignees.map((a) => ({
        id: a.id,
        userId: a.userId,
        userName: a.userName,
        assignedAt: a.assignedAt.toISOString()
      }))
    : row.assignedUserId
      ? [{
          id: `legacy-${row.assignedUserId}`,
          userId: row.assignedUserId,
          userName: row.assignedUserName || row.assignedUserId,
          assignedAt: (row.assignedAt || row.createdAt).toISOString()
        }]
      : [];

  return {
    id: row.id,
    doNumber: row.doNumber,
    salesRecordId: row.salesRecordId,
    status: row.status as DeliveryOrderStatus,
    packingStatus: row.packingStatus as PackingStatus,
    shippingStatus: row.shippingStatus as ShippingStatus,
    assignedUserId: row.assignedUserId || undefined,
    assignedUserName: row.assignedUserName || undefined,
    assignedAt: row.assignedAt ? row.assignedAt.toISOString() : undefined,
    assignedOfficers,
    packedByUserId: row.packedByUserId || undefined,
    packedByNameSnapshot: row.packedByNameSnapshot || undefined,
    packedAt: row.packedAt ? row.packedAt.toISOString() : undefined,
    shippedByUserId: row.shippedByUserId || undefined,
    shippedByNameSnapshot: row.shippedByNameSnapshot || undefined,
    shippedAt: row.shippedAt ? row.shippedAt.toISOString() : undefined,
    receiptPhotoUrl: row.receiptPhotoUrl || undefined,
    trackingNumber: row.trackingNumber || undefined,
    notes: row.notes || undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : (row.createdAt || new Date().toISOString()),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : (row.updatedAt || new Date().toISOString()),
    sale: {
      id: row.salesRecord.id,
      transactionNumber: row.salesRecord.transactionNumber || undefined,
      saleDate: row.salesRecord.saleDate instanceof Date ? row.salesRecord.saleDate.toISOString() : (row.salesRecord.saleDate || new Date().toISOString()),
      customerName: row.salesRecord.customerName,
      customerLocation: row.salesRecord.customerLocation || undefined,
      shippingMethod: row.salesRecord.shippingMethod || undefined,
      deliveryAt: row.salesRecord.deliveryAt ? row.salesRecord.deliveryAt.toISOString() : undefined,
      source: row.salesRecord.source || undefined,
      createdByUserId: row.salesRecord.createdByUserId || undefined
    },
    items: row.items.map((item) => ({
      id: item.id,
      deliveryOrderId: item.deliveryOrderId,
      salesRecordItemId: item.salesRecordItemId,
      productRef: item.productRef,
      productNameSnapshot: item.productNameSnapshot,
      warehouseNameSnapshot: item.warehouseNameSnapshot || undefined,
      rackNameSnapshot: item.rackNameSnapshot || undefined,
      unitSnapshot: item.unitSnapshot || undefined,
      quantity: Number(item.quantity),
      isShipped: item.isShipped,
      shippedQuantity: Number(item.shippedQuantity),
      shippedAt: item.shippedAt ? item.shippedAt.toISOString() : undefined
    }))
  };
}

export async function assignDeliveryOrder(
  id: string,
  assignedUserId: string,
  assignedUserName: string,
  actor?: CurrentUser
) {
  return prisma.$transaction(async (tx) => {
    const doRow = await tx.deliveryOrder.findFirst({
      where: { OR: [{ id }, { salesRecordId: id }] }
    });
    if (!doRow) throw new Error("Delivery Order tidak ditemukan.");

    if (doRow.status === "selesai" && actor?.role !== "OWNER") {
      throw new Error("Delivery Order yang sudah selesai tidak dapat diubah kecuali oleh Super Admin.");
    }

    const updated = await tx.deliveryOrder.update({
      where: { id: doRow.id },
      data: {
        assignedUserId,
        assignedUserName,
        assignedAt: new Date()
      },
      include: { items: true }
    });

    await tx.salesRecord.update({
      where: { id: doRow.salesRecordId },
      data: {
        doAssignedUserId: assignedUserId,
        doAssignedUserName: assignedUserName
      }
    });

    await tx.deliveryOrderAssignee.upsert({
      where: {
        deliveryOrderId_userId: {
          deliveryOrderId: doRow.id,
          userId: assignedUserId
        }
      },
      create: {
        deliveryOrderId: doRow.id,
        userId: assignedUserId,
        userName: assignedUserName
      },
      update: {
        userName: assignedUserName
      }
    });

    if (actor) {
      await recordAudit({
        entityType: "delivery_order",
        entityId: doRow.id,
        action: "update",
        afterValue: { assignedUserId, assignedUserName },
        reason: `Petugas DO ditugaskan ke: ${assignedUserName}`
      });
    }

    return updated;
  });
}

export async function addDeliveryOrderAssignee(
  id: string,
  userId: string,
  userName: string,
  actor?: CurrentUser
) {
  return prisma.$transaction(async (tx) => {
    const doRow = await tx.deliveryOrder.findFirst({
      where: { OR: [{ id }, { salesRecordId: id }] }
    });
    if (!doRow) throw new Error("Delivery Order tidak ditemukan.");

    if (doRow.status === "selesai" && actor?.role !== "OWNER") {
      throw new Error("Delivery Order yang sudah selesai tidak dapat diubah kecuali oleh Super Admin.");
    }

    const existing = await tx.deliveryOrderAssignee.findFirst({
      where: { deliveryOrderId: doRow.id, userId }
    });

    if (!existing) {
      await tx.deliveryOrderAssignee.create({
        data: {
          deliveryOrderId: doRow.id,
          userId,
          userName
        }
      });
    }

    if (!doRow.assignedUserId) {
      await tx.deliveryOrder.update({
        where: { id: doRow.id },
        data: {
          assignedUserId: userId,
          assignedUserName: userName,
          assignedAt: new Date()
        }
      });
      await tx.salesRecord.update({
        where: { id: doRow.salesRecordId },
        data: {
          doAssignedUserId: userId,
          doAssignedUserName: userName
        }
      });
    }

    if (actor) {
      await recordAudit({
        entityType: "delivery_order",
        entityId: doRow.id,
        action: "update",
        afterValue: { addedUserId: userId, addedUserName: userName },
        reason: `${actor.name} menambahkan Petugas DO: ${userName}`
      });
    }

    return getDeliveryOrderDetail(doRow.id);
  });
}

export async function removeDeliveryOrderAssignee(
  id: string,
  userId: string,
  actor?: CurrentUser
) {
  return prisma.$transaction(async (tx) => {
    const doRow = await tx.deliveryOrder.findFirst({
      where: { OR: [{ id }, { salesRecordId: id }] },
      include: { assignees: true }
    });
    if (!doRow) throw new Error("Delivery Order tidak ditemukan.");

    if (doRow.status === "selesai" && actor?.role !== "OWNER") {
      throw new Error("Delivery Order yang sudah selesai tidak dapat diubah kecuali oleh Super Admin.");
    }

    await tx.deliveryOrderAssignee.deleteMany({
      where: { deliveryOrderId: doRow.id, userId }
    });

    if (doRow.assignedUserId === userId) {
      const remaining = await tx.deliveryOrderAssignee.findFirst({
        where: { deliveryOrderId: doRow.id }
      });
      await tx.deliveryOrder.update({
        where: { id: doRow.id },
        data: {
          assignedUserId: remaining ? remaining.userId : null,
          assignedUserName: remaining ? remaining.userName : null,
          assignedAt: remaining ? remaining.assignedAt : null
        }
      });
      await tx.salesRecord.update({
        where: { id: doRow.salesRecordId },
        data: {
          doAssignedUserId: remaining ? remaining.userId : null,
          doAssignedUserName: remaining ? remaining.userName : null
        }
      });
    }

    if (actor) {
      await recordAudit({
        entityType: "delivery_order",
        entityId: doRow.id,
        action: "update",
        afterValue: { removedUserId: userId },
        reason: `${actor.name} menghapus Petugas DO dengan ID: ${userId}`
      });
    }

    return getDeliveryOrderDetail(doRow.id);
  });
}

export async function updateDeliveryOrderPacking(
  id: string,
  packedItemIds: string[],
  actor?: CurrentUser
) {
  return prisma.$transaction(async (tx) => {
    const doRow = await tx.deliveryOrder.findFirst({
      where: { OR: [{ id }, { salesRecordId: id }] },
      include: { items: true }
    });
    if (!doRow) throw new Error("Delivery Order tidak ditemukan.");

    if (doRow.status === "selesai" && actor?.role !== "OWNER") {
      throw new Error("Delivery Order yang sudah selesai tidak dapat diubah kecuali oleh Super Admin.");
    }

    const packingStatus: PackingStatus = "sudah";

    const updated = await tx.deliveryOrder.update({
      where: { id: doRow.id },
      data: {
        packingStatus,
        packedByUserId: actor?.id || "system",
        packedByNameSnapshot: actor?.name || "System",
        packedAt: new Date()
      },
      include: { items: true }
    });

    await tx.salesRecord.update({
      where: { id: doRow.salesRecordId },
      data: {
        doPackingStatus: packingStatus
      }
    });

    if (actor) {
      await recordAudit({
        entityType: "delivery_order",
        entityId: doRow.id,
        action: "update",
        afterValue: { packingStatus, packedItemIds },
        reason: `Status Packing diubah menjadi Sudah oleh ${actor.name}`
      });
    }

    return updated;
  });
}

export async function completeDeliveryOrderShipping(
  id: string,
  input: {
    shippedItemIds: string[];
    receiptPhotoUrl?: string;
    trackingNumber?: string;
    notes?: string;
  },
  actor?: CurrentUser
) {
  return prisma.$transaction(async (tx) => {
    const doRow = await tx.deliveryOrder.findFirst({
      where: { OR: [{ id }, { salesRecordId: id }] },
      include: { items: true }
    });
    if (!doRow) throw new Error("Delivery Order tidak ditemukan.");

    if (doRow.status === "selesai" && actor?.role !== "OWNER") {
      throw new Error("Delivery Order yang sudah selesai tidak dapat diubah kecuali oleh Super Admin.");
    }

    if (!input.shippedItemIds || input.shippedItemIds.length === 0) {
      throw new Error("Pilih setidaknya satu barang yang dikirim.");
    }

    const resolvedPhoto = input.receiptPhotoUrl || doRow.receiptPhotoUrl;
    const validPhotos = parseReceiptPhotos(resolvedPhoto);
    if (validPhotos.length === 0) {
      throw new Error("Foto bukti pengiriman wajib dilampirkan sebelum memproses pengiriman DO.");
    }

    const totalItems = doRow.items.length;
    // Hitung juga item yang sudah dikirim sebelumnya (pengiriman bertahap).
    const requestedIds = new Set(input.shippedItemIds);
    const shippedCount = doRow.items.filter((item) => item.isShipped || requestedIds.has(item.id)).length;
    const isFullShipment = shippedCount >= totalItems;
    const status: DeliveryOrderStatus = isFullShipment ? "selesai" : "selesai_setengah";
    const packingStatus: PackingStatus = "sudah";
    const shippingStatus: ShippingStatus = "sudah";
    const now = new Date();

    // Mark items as shipped
    await tx.deliveryOrderItem.updateMany({
      where: {
        deliveryOrderId: doRow.id,
        id: { in: input.shippedItemIds }
      },
      data: {
        isShipped: true,
        shippedAt: now
      }
    });

    const updated = await tx.deliveryOrder.update({
      where: { id: doRow.id },
      data: {
        status,
        packingStatus,
        shippingStatus,
        shippedByUserId: actor?.id || "system",
        shippedByNameSnapshot: actor?.name || "System",
        shippedAt: now,
        receiptPhotoUrl: resolvedPhoto,
        trackingNumber: input.trackingNumber || doRow.trackingNumber,
        notes: input.notes !== undefined ? input.notes : doRow.notes
      },
      include: { items: true }
    });

    // Update SalesRecord denormalized DO fields
    await tx.salesRecord.update({
      where: { id: doRow.salesRecordId },
      data: {
        doStatus: status,
        doPackingStatus: packingStatus,
        doShippingStatus: shippingStatus,
        doReceiptPhotoUrl: resolvedPhoto,
        doTrackingNumber: input.trackingNumber || doRow.trackingNumber
      }
    });

    if (actor) {
      await recordAudit({
        entityType: "delivery_order",
        entityId: doRow.id,
        action: "update",
        afterValue: {
          status,
          packingStatus,
          shippingStatus,
          shippedCount,
          totalItems,
          receiptPhotoUrl: resolvedPhoto,
          trackingNumber: input.trackingNumber
        },
        reason: `Pengiriman DO diproses: ${status === "selesai" ? "Selesai (Semua Barang)" : "Selesai Setengah (Sebagian Barang)"} oleh ${actor.name}`
      });
    }

    return updated;
  });
}

export async function updateDeliveryOrderReceiptPhotos(
  deliveryOrderId: string,
  receiptPhotoUrl: string,
  actor?: CurrentUser
) {
  return prisma.$transaction(async (tx) => {
    const doRow = await tx.deliveryOrder.findUnique({
      where: { id: deliveryOrderId }
    });

    if (!doRow) {
      throw new Error("Delivery Order tidak ditemukan.");
    }

    const updated = await tx.deliveryOrder.update({
      where: { id: deliveryOrderId },
      data: {
        receiptPhotoUrl: receiptPhotoUrl || null
      },
      include: { items: true }
    });

    if (doRow.salesRecordId) {
      await tx.salesRecord.update({
        where: { id: doRow.salesRecordId },
        data: {
          doReceiptPhotoUrl: receiptPhotoUrl || null
        }
      });
    }

    if (actor) {
      await recordAudit({
        entityType: "delivery_order",
        entityId: deliveryOrderId,
        action: "update",
        afterValue: {
          receiptPhotoUrl
        },
        reason: `Foto bukti pengiriman DO diperbarui oleh ${actor.name}`
      });
    }

    return updated;
  });
}

export async function listDeliveryOfficers() {
  // First try users with DELIVERY_DRIVER role
  const drivers = await prisma.user.findMany({
    where: { isActive: true, role: "DELIVERY_DRIVER" },
    select: { id: true, name: true, role: true, email: true },
    orderBy: { name: "asc" }
  });

  if (drivers.length > 0) return drivers;

  // If none configured yet, return active staff (Admin, Supervisor, Owner) as fallback assignees
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true, email: true },
    orderBy: { name: "asc" }
  });
}
