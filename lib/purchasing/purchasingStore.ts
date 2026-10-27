import "server-only";
import { prisma } from "@/lib/db/prisma";
import type {
  PurchaseOrderStatus,
  PurchaseInvoiceStatus,
  LandedCostType,
  LandedCostAllocationMethod,
  Prisma
} from "@prisma/client";
import type {
  SupplierInput,
  PurchaseOrderInput,
  PurchaseReceiptInput,
  PurchaseInvoiceInput
} from "@/lib/validation/purchasingSchema";
import { recordAudit } from "@/lib/audit/store";
import { postPurchaseInvoiceJournal, type PurchasingActor } from "@/lib/purchasing/postingHooks";

// =====================================================================
// 1. LANDED COST ALLOCATION CALCULATOR (RE-EXPORT FROM SHARED UTILITY)
// =====================================================================

export {
  allocateLandedCost,
  type LandedCostInputItem,
  type LandedCostCalculationFee,
  type ItemCostAllocationResult,
  type LandedCostSummaryResult
} from "@/lib/purchasing/landedCostCalculator";

// =====================================================================
// 2. SUPPLIER MANAGEMENT
// =====================================================================

export async function listSuppliers(params?: {
  keyword?: string;
  currency?: string;
  isActive?: boolean;
}) {
  if (typeof prisma?.supplier?.findMany !== "function") return [];

  const where: Prisma.SupplierWhereInput = {};
  if (params?.keyword) {
    where.OR = [
      { code: { contains: params.keyword, mode: "insensitive" } },
      { name: { contains: params.keyword, mode: "insensitive" } },
      { contactPerson: { contains: params.keyword, mode: "insensitive" } }
    ];
  }
  if (params?.currency) {
    where.currency = params.currency.toUpperCase();
  }
  if (params?.isActive !== undefined) {
    where.isActive = params.isActive;
  }

  return prisma.supplier.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { name: "asc" }]
  });
}

export async function getSupplierById(id: string) {
  if (typeof prisma?.supplier?.findUnique !== "function") return null;
  return prisma.supplier.findUnique({
    where: { id },
    include: {
      purchaseOrders: {
        take: 5,
        orderBy: { orderDate: "desc" }
      },
      purchaseInvoices: {
        take: 5,
        orderBy: { invoiceDate: "desc" }
      }
    }
  });
}

export async function createSupplier(input: SupplierInput, actor: PurchasingActor) {
  if (typeof prisma?.supplier?.create !== "function") return null;

  const existing = await prisma.supplier.findUnique({ where: { code: input.code.toUpperCase() } });
  if (existing) throw new Error(`Supplier dengan kode ${input.code} sudah ada.`);

  const supplier = await prisma.supplier.create({
    data: {
      code: input.code.toUpperCase(),
      name: input.name,
      country: (input.country || "ID").toUpperCase(),
      currency: (input.currency || "IDR").toUpperCase(),
      contactPerson: input.contactPerson || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      taxId: input.taxId || null,
      paymentTermsDays: input.paymentTermsDays ?? 30,
      isActive: input.isActive ?? true
    }
  });

  await recordAudit({
    entityType: "purchase",
    entityId: supplier.id,
    action: "create",
    afterValue: supplier,
    reason: `Tambah supplier ${supplier.name} (${supplier.code})`
  });

  return supplier;
}

export async function updateSupplier(id: string, input: SupplierInput, actor: PurchasingActor) {
  if (typeof prisma?.supplier?.update !== "function") return null;

  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw new Error("Supplier tidak ditemukan.");

  const updated = await prisma.supplier.update({
    where: { id },
    data: {
      name: input.name,
      country: (input.country || "ID").toUpperCase(),
      currency: (input.currency || "IDR").toUpperCase(),
      contactPerson: input.contactPerson || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      taxId: input.taxId || null,
      paymentTermsDays: input.paymentTermsDays ?? 30,
      isActive: input.isActive ?? true
    }
  });

  await recordAudit({
    entityType: "purchase",
    entityId: id,
    action: "update",
    beforeValue: existing,
    afterValue: updated,
    reason: `Update supplier ${updated.name}`
  });

  return updated;
}

// =====================================================================
// 3. PURCHASE ORDERS
// =====================================================================

export async function generatePoNumber(): Promise<string> {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `PO-${yearMonth}-`;

  if (typeof prisma?.purchaseOrder?.count !== "function") {
    return `${prefix}0001`;
  }

  const count = await prisma.purchaseOrder.count({
    where: { poNumber: { startsWith: prefix } }
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function listPurchaseOrders(params?: {
  status?: PurchaseOrderStatus;
  supplierId?: string;
  keyword?: string;
}) {
  if (typeof prisma?.purchaseOrder?.findMany !== "function") return [];

  const where: Prisma.PurchaseOrderWhereInput = {};
  if (params?.status) where.status = params.status;
  if (params?.supplierId) where.supplierId = params.supplierId;
  if (params?.keyword) {
    where.OR = [
      { poNumber: { contains: params.keyword, mode: "insensitive" } },
      { supplier: { name: { contains: params.keyword, mode: "insensitive" } } }
    ];
  }

  return prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: true,
      items: true,
      receipts: {
        include: { items: true }
      },
      invoices: true
    },
    orderBy: { orderDate: "desc" }
  });
}

export async function getPurchaseOrderById(id: string) {
  if (typeof prisma?.purchaseOrder?.findUnique !== "function") return null;
  return prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: true,
      receipts: {
        include: { items: true }
      },
      invoices: true
    }
  });
}

export async function createPurchaseOrder(
  input: PurchaseOrderInput,
  actor: PurchasingActor
) {
  if (typeof prisma?.purchaseOrder?.create !== "function") return null;

  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new Error("Supplier tidak ditemukan.");

  const poNumber = input.poNumber?.trim() || (await generatePoNumber());

  let subtotalOriginal = 0;
  const itemsData = input.items.map((it, idx) => {
    const totalOriginal = it.quantity * it.unitPriceOriginal;
    const totalIdr = Math.round(totalOriginal * input.exchangeRate);
    const unitPriceIdr = Math.round(it.unitPriceOriginal * input.exchangeRate);
    subtotalOriginal += totalOriginal;

    return {
      itemCode: it.itemCode,
      itemName: it.itemName,
      unit: it.unit || "PCS",
      quantity: it.quantity,
      unitPriceOriginal: it.unitPriceOriginal,
      unitPriceIdr,
      totalAmountOriginal: totalOriginal,
      totalAmountIdr: totalIdr,
      notes: it.notes || null,
      sortOrder: idx
    };
  });

  const subtotalIdr = Math.round(subtotalOriginal * input.exchangeRate);

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      supplierId: input.supplierId,
      orderDate: new Date(input.orderDate),
      expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
      currency: input.currency.toUpperCase(),
      exchangeRate: input.exchangeRate,
      subtotalOriginal,
      subtotalIdr,
      totalTaxIdr: 0,
      totalAmountOriginal: subtotalOriginal,
      totalAmountIdr: subtotalIdr,
      status: "DRAFT",
      notes: input.notes || null,
      createdByUserId: actor.id,
      createdByNameSnapshot: actor.name,
      items: {
        create: itemsData
      }
    },
    include: {
      supplier: true,
      items: true
    }
  });

  await recordAudit({
    entityType: "purchase",
    entityId: po.id,
    action: "create",
    afterValue: po,
    reason: `Buat PO ${po.poNumber} untuk ${supplier.name} (${po.currency} ${subtotalOriginal})`
  });

  return po;
}

export async function updatePurchaseOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
  actor: PurchasingActor
) {
  if (typeof prisma?.purchaseOrder?.update !== "function") return null;

  const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!existing) throw new Error("Purchase Order tidak ditemukan.");

  const updateData: any = { status };
  if (status === "APPROVED" && !existing.approvedAt) {
    updateData.approvedByUserId = actor.id;
    updateData.approvedByNameSnapshot = actor.name;
    updateData.approvedAt = new Date();
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: updateData,
    include: { supplier: true, items: true }
  });

  await recordAudit({
    entityType: "purchase",
    entityId: id,
    action: status === "APPROVED" ? "approve" : "update",
    beforeValue: existing,
    afterValue: updated,
    reason: `Update status PO ${updated.poNumber} menjadi ${status}`
  });

  return updated;
}

// =====================================================================
// 4. GOODS RECEIPT (PENERIMAAN BARANG)
// =====================================================================

export async function generateGrnNumber(): Promise<string> {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `GRN-${yearMonth}-`;

  if (typeof prisma?.purchaseReceipt?.count !== "function") {
    return `${prefix}0001`;
  }

  const count = await prisma.purchaseReceipt.count({
    where: { grnNumber: { startsWith: prefix } }
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function createPurchaseReceipt(
  input: PurchaseReceiptInput,
  actor: PurchasingActor
) {
  if (typeof prisma?.purchaseReceipt?.create !== "function") return null;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: input.purchaseOrderId },
    include: { items: true }
  });
  if (!po) throw new Error("Purchase order tidak ditemukan.");

  const grnNumber = input.grnNumber?.trim() || (await generateGrnNumber());

  const receipt = await prisma.purchaseReceipt.create({
    data: {
      grnNumber,
      purchaseOrderId: po.id,
      receiptDate: new Date(input.receiptDate),
      warehouseName: input.warehouseName || "Gudang Utama",
      notes: input.notes || null,
      receivedByUserId: actor.id,
      receivedByNameSnapshot: actor.name,
      items: {
        create: input.items.map((it) => {
          const poItem = po.items.find((poi) => poi.id === it.purchaseOrderItemId);
          return {
            purchaseOrderItemId: it.purchaseOrderItemId,
            itemCode: it.itemCode || poItem?.itemCode || "UNKNOWN",
            itemName: it.itemName || poItem?.itemName || "Barang Diterima",
            unit: it.unit || poItem?.unit || "PCS",
            quantityReceived: it.quantityReceived,
            notes: it.notes || null
          };
        })
      }
    },
    include: { items: true }
  });

  // Update receivedQuantity on PO items
  for (const item of input.items) {
    await prisma.purchaseOrderItem.update({
      where: { id: item.purchaseOrderItemId },
      data: {
        receivedQuantity: { increment: item.quantityReceived }
      }
    });
  }

  // Check PO status
  const updatedPo = await prisma.purchaseOrder.findUnique({
    where: { id: po.id },
    include: { items: true }
  });

  if (updatedPo) {
    const allCompleted = updatedPo.items.every(
      (it) => Number(it.receivedQuantity) >= Number(it.quantity)
    );
    const anyReceived = updatedPo.items.some((it) => Number(it.receivedQuantity) > 0);

    const newStatus: PurchaseOrderStatus = allCompleted
      ? "COMPLETED"
      : anyReceived
      ? "PARTIAL_RECEIVED"
      : po.status;

    if (newStatus !== po.status) {
      await prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { status: newStatus }
      });
    }
  }

  await recordAudit({
    entityType: "purchase",
    entityId: receipt.id,
    action: "create",
    afterValue: receipt,
    reason: `Penerimaan barang ${receipt.grnNumber} untuk PO ${po.poNumber}`
  });

  return receipt;
}

// =====================================================================
// 5. PURCHASE INVOICES (TAGIHAN & LANDED COST)
// =====================================================================

export async function generateInvoiceNumber(): Promise<string> {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `INV-PUR-${yearMonth}-`;

  if (typeof prisma?.purchaseInvoice?.count !== "function") {
    return `${prefix}0001`;
  }

  const count = await prisma.purchaseInvoice.count({
    where: { invoiceNumber: { startsWith: prefix } }
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function listPurchaseInvoices(params?: {
  status?: PurchaseInvoiceStatus;
  supplierId?: string;
  keyword?: string;
}) {
  if (typeof prisma?.purchaseInvoice?.findMany !== "function") return [];

  const where: Prisma.PurchaseInvoiceWhereInput = {};
  if (params?.status) where.status = params.status;
  if (params?.supplierId) where.supplierId = params.supplierId;
  if (params?.keyword) {
    where.OR = [
      { invoiceNumber: { contains: params.keyword, mode: "insensitive" } },
      { supplierInvoiceNumber: { contains: params.keyword, mode: "insensitive" } },
      { supplier: { name: { contains: params.keyword, mode: "insensitive" } } }
    ];
  }

  return prisma.purchaseInvoice.findMany({
    where,
    include: {
      supplier: true,
      purchaseOrder: true,
      landedCosts: {
        include: { paymentAccount: true }
      },
      payments: {
        include: { rekeningAccount: true }
      },
      journalEntry: {
        include: { lines: true }
      }
    },
    orderBy: { invoiceDate: "desc" }
  });
}

export async function getPurchaseInvoiceById(id: string) {
  if (typeof prisma?.purchaseInvoice?.findUnique !== "function") return null;
  return prisma.purchaseInvoice.findUnique({
    where: { id },
    include: {
      supplier: true,
      purchaseOrder: {
        include: { items: true }
      },
      landedCosts: {
        include: { paymentAccount: true }
      },
      payments: {
        include: { rekeningAccount: true }
      },
      journalEntry: {
        include: { lines: true }
      }
    }
  });
}

export const getPurchaseInvoice = getPurchaseInvoiceById;

export async function createPurchaseInvoice(
  input: PurchaseInvoiceInput,
  actor: PurchasingActor
) {
  if (typeof prisma?.purchaseInvoice?.create !== "function") return null;

  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new Error("Supplier tidak ditemukan.");

  const invoiceNumber = input.invoiceNumber?.trim() || (await generateInvoiceNumber());

  const subtotalOriginal = input.subtotalOriginal;
  const subtotalIdr = Math.round(subtotalOriginal * input.exchangeRate);

  // Landed costs calculation
  const landedCostsData = (input.landedCosts || []).map((lc) => {
    const exRate = lc.exchangeRate || 1;
    const amountIdr = lc.amountIdr ? Math.round(lc.amountIdr) : Math.round(lc.originalAmount * exRate);
    return {
      costType: lc.costType,
      isCreditableTax: lc.isCreditableTax || false,
      description: lc.description,
      vendorName: lc.vendorName || null,
      originalCurrency: lc.originalCurrency || "IDR",
      originalAmount: lc.originalAmount,
      exchangeRate: exRate,
      amountIdr,
      allocationMethod: lc.allocationMethod || "BY_VALUE",
      paymentAccountId: lc.paymentAccountId || null,
      notes: lc.notes || null
    };
  });

  const landedCostTotalIdr = landedCostsData
    .filter((lc) => !lc.isCreditableTax)
    .reduce((sum, lc) => sum + lc.amountIdr, 0);

  const invoice = await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber,
      supplierInvoiceNumber: input.supplierInvoiceNumber,
      purchaseOrderId: input.purchaseOrderId || null,
      supplierId: input.supplierId,
      invoiceDate: new Date(input.invoiceDate),
      dueDate: new Date(input.dueDate),
      currency: input.currency.toUpperCase(),
      exchangeRate: input.exchangeRate,
      subtotalOriginal,
      subtotalIdr,
      landedCostTotalIdr,
      totalAmountOriginal: subtotalOriginal,
      totalAmountIdr: subtotalIdr,
      totalPaidOriginal: 0,
      totalPaidIdr: 0,
      status: "DRAFT",
      notes: input.notes || null,
      createdByUserId: actor.id,
      createdByNameSnapshot: actor.name,
      landedCosts: {
        create: landedCostsData
      }
    },
    include: {
      supplier: true,
      landedCosts: true
    }
  });

  await recordAudit({
    entityType: "purchase",
    entityId: invoice.id,
    action: "create",
    afterValue: invoice,
    reason: `Buat Invoice Pembelian ${invoice.invoiceNumber} (${supplier.name} ${invoice.currency} ${subtotalOriginal})`
  });

  return invoice;
}

export async function postPurchaseInvoice(id: string, actor: PurchasingActor) {
  if (typeof prisma?.purchaseInvoice?.update !== "function") return null;

  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id },
    include: { landedCosts: true }
  });
  if (!invoice) throw new Error("Invoice tidak ditemukan.");
  if (invoice.status !== "DRAFT") {
    throw new Error(`Invoice sudah berstatus ${invoice.status}, tidak bisa di-post.`);
  }

  // Generate automated journal
  await postPurchaseInvoiceJournal(id, actor);

  const updated = await prisma.purchaseInvoice.update({
    where: { id },
    data: { status: "POSTED" },
    include: {
      supplier: true,
      landedCosts: true,
      journalEntry: { include: { lines: true } }
    }
  });

  await recordAudit({
    entityType: "purchase",
    entityId: id,
    action: "approve",
    afterValue: updated,
    reason: `Post Invoice Pembelian ${updated.invoiceNumber}`
  });

  return updated;
}
