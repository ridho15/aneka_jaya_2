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

export type ListDeliveryOrdersFilter = {
  status?: string;
  packingStatus?: string;
  shippingStatus?: string;
  assignedUserId?: string;
  search?: string;
};

export async function createDeliveryOrderForSale(saleId: string, customTx?: Prisma.TransactionClient) {
  const runner = async (tx: Prisma.TransactionClient) => {
    if (!tx?.deliveryOrder || !tx?.salesRecord) return null;
    const existing = await tx.deliveryOrder.findUnique({
      where: { salesRecordId: saleId },
      include: { items: true }
    });
    if (existing) return existing;

    const sale = await tx.salesRecord.findUnique({
      where: { id: saleId },
      include: { items: { orderBy: { sortOrder: "asc" } } }
    });

    if (!sale) {
      throw new Error(`Sales record dengan ID ${saleId} tidak ditemukan.`);
    }

    const doNumber = sale.transactionNumber
      ? `DO-${sale.transactionNumber}`
      : `DO-${saleId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()}`;

    const createdDo = await tx.deliveryOrder.create({
      data: {
        doNumber,
        salesRecordId: sale.id,
        status: "belum_selesai",
        packingStatus: "belum",
        shippingStatus: "belum",
        items: {
          create: sale.items.map((item) => {
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
          })
        }
      },
      include: { items: true }
    });

    // Sync denormalized status to SalesRecord
    await tx.salesRecord.update({
      where: { id: sale.id },
      data: {
        doStatus: "belum_selesai",
        doPackingStatus: "belum",
        doShippingStatus: "belum"
      }
    });

    return createdDo;
  };

  if (customTx) {
    return runner(customTx);
  }
  return prisma.$transaction(runner);
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

function buildDeliveryOrderWhere(filters: ListDeliveryOrdersFilter = {}): Prisma.DeliveryOrderWhereInput {
  const andConditions: Prisma.DeliveryOrderWhereInput[] = [];

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
  const where = buildDeliveryOrderWhere(params.filters);

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
  const where = buildDeliveryOrderWhere(filters);

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

export async function getDeliveryOrderDetail(id: string): Promise<DeliveryOrderData | null> {
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
          deliveryAt: true
        }
      },
      items: true,
      assignees: true
    }
  });

  if (!row) return null;

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
      deliveryAt: row.salesRecord.deliveryAt ? row.salesRecord.deliveryAt.toISOString() : undefined
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

    if (!input.shippedItemIds || input.shippedItemIds.length === 0) {
      throw new Error("Pilih setidaknya satu barang yang dikirim.");
    }

    const totalItems = doRow.items.length;
    const shippedCount = input.shippedItemIds.length;
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
        receiptPhotoUrl: input.receiptPhotoUrl || doRow.receiptPhotoUrl,
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
        doReceiptPhotoUrl: input.receiptPhotoUrl || doRow.receiptPhotoUrl,
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
          receiptPhotoUrl: input.receiptPhotoUrl,
          trackingNumber: input.trackingNumber
        },
        reason: `Pengiriman DO diproses: ${status === "selesai" ? "Selesai (Semua Barang)" : "Selesai Setengah (Sebagian Barang)"} oleh ${actor.name}`
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
