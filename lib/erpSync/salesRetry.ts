import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/store";
import {
  erpReferenceFrom,
  resolveErpCustomerId,
  safeErpSyncError,
  sendOfficialSalesToErp,
} from "@/lib/api/sales";
import type { PenjualanInput } from "@/lib/validation/penjualanSchema";
import {
  releaseSaleStock,
  stockReleaseErrorFrom,
} from "@/lib/api/stockReleases";
import { findErpInvoiceForCustomerPayment, syncErpSalesPayment } from "@/lib/api/salesPayments";
import {
  listRekeningAccounts,
  rekeningForTipe,
} from "@/lib/business/masterData";

const salesInclude = { items: { orderBy: { sortOrder: "asc" as const } } };

type SalesRow = Prisma.SalesRecordGetPayload<{ include: typeof salesInclude }>;

export type ErpSyncSaleItem = {
  id: string;
  saleDate: string;
  tipeCode: string;
  customerName: string;
  paymentMethod: string;
  total: number;
  syncStatus: string;
  syncError?: string;
  syncAttemptedAt?: string;
  syncedAt?: string;
  erpReference?: string;
  stockReleaseStatus?: string;
  stockReleaseError?: string;
  stockReleaseReference?: string;
  stockReleasedAt?: string;
  erpPaymentStatus?: string;
  erpPaymentError?: string;
  erpPaymentReference?: string;
  erpPaymentSyncedAt?: string;
  erpPaymentAttemptedAt?: string;
  retryable: boolean;
};

export type ErpSyncOverview = {
  summary: {
    pending: number;
    failed: number;
    synced: number;
    totalErp: number;
  };
  items: ErpSyncSaleItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  storageReady: boolean;
  warning?: string;
};

const PRISMA_SYNC_WARNING =
  "Prisma Client belum tersinkron. Jalankan generate/migrate dan restart server.";
const DEFAULT_SYNC_PAGE_SIZE = 10;
const MAX_SYNC_PAGE_SIZE = 50;

function cleanPage(value?: number) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 1;
}

function cleanPageSize(value?: number) {
  if (!Number.isFinite(value) || !value || value <= 0)
    return DEFAULT_SYNC_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(value), 1), MAX_SYNC_PAGE_SIZE);
}

function correlationIdFromFailure(response: {
  success: false;
  details?: unknown;
}) {
  const details =
    response.details && typeof response.details === "object"
      ? (response.details as Record<string, unknown>)
      : {};
  return typeof details.correlationId === "string"
    ? details.correlationId
    : undefined;
}

function salesDelegate() {
  return (prisma as typeof prisma & { salesRecord?: typeof prisma.salesRecord })
    .salesRecord;
}

function toSyncItem(row: SalesRow): ErpSyncSaleItem {
  return {
    id: row.id,
    saleDate: row.saleDate.toISOString().slice(0, 10),
    tipeCode: row.tipeCodeSnapshot,
    customerName: row.customerName,
    paymentMethod: row.paymentMethod as PenjualanInput["paymentMethod"],
    total: Number(row.total),
    syncStatus: row.syncStatus,
    syncError: row.syncError || undefined,
    syncAttemptedAt: row.syncAttemptedAt?.toISOString(),
    syncedAt: row.syncedAt?.toISOString(),
    erpReference: row.erpReference || undefined,
    stockReleaseStatus: row.stockReleaseStatus,
    stockReleaseError: row.stockReleaseError || undefined,
    stockReleaseReference: row.stockReleaseReference || undefined,
    stockReleasedAt: row.stockReleasedAt?.toISOString(),
    erpPaymentStatus: row.erpPaymentStatus,
    erpPaymentError: row.erpPaymentError || undefined,
    erpPaymentReference: row.erpPaymentReference || undefined,
    erpPaymentSyncedAt: row.erpPaymentSyncedAt?.toISOString(),
    erpPaymentAttemptedAt: row.erpPaymentAttemptedAt?.toISOString(),
    retryable:
      ["pending", "failed"].includes(row.syncStatus) ||
      ["pending", "failed"].includes(row.stockReleaseStatus) ||
      ["pending", "failed"].includes(row.erpPaymentStatus),
  };
}

function buildRetryInput(row: SalesRow) {
  return {
    saleDate: row.saleDate.toISOString().slice(0, 10),
    customerName: row.customerName,
    customerLocation: row.customerLocation || undefined,
    paymentMethod: row.paymentMethod as PenjualanInput["paymentMethod"],
    dueDate: row.dueDate?.toISOString().slice(0, 10),
    deliveryDate: undefined,
    shippingMethod: row.shippingMethod || undefined,
    notes: row.notes || undefined,
    items: row.items.map((item) => ({
      productRef: item.productRef,
      productId: item.productId || undefined,
      productInputMode: item.manualProduct
        ? ("manual" as const)
        : ("erp" as const),
      manualProduct:
        item.manualProduct && typeof item.manualProduct === "object"
          ? (item.manualProduct as PenjualanInput["items"][number]["manualProduct"])
          : undefined,
      warehouseId: item.warehouseId || undefined,
      warehouseNameSnapshot: item.warehouseNameSnapshot || undefined,
      rackId: item.rackId || undefined,
      rackNameSnapshot: item.rackNameSnapshot || undefined,
      unitSnapshot: item.unitSnapshot || undefined,
      uomIdSnapshot: item.uomIdSnapshot ?? undefined,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount),
    })),
  };
}

function isImmediatePayment(method: string) {
  return method === "Cash" || method === "TF";
}

function paymentError(response: { success: false; message?: string }) {
  return response.message || "Payment ERP gagal dibuat.";
}

function isStockReleaseReference(value?: string | null) {
  return String(value || "").startsWith("SLM-STOCK-");
}

function shouldRecoverInvoiceReference(value?: string | null) {
  const reference = String(value || "").trim();
  return (
    !reference ||
    /^\d+$/.test(reference) ||
    reference.startsWith("SLM-SO-") ||
    isStockReleaseReference(reference)
  );
}

async function retryImmediateSalesPayment(
  row: SalesRow,
): Promise<{ success: boolean; item?: ErpSyncSaleItem; message: string }> {
  const attemptedAt = new Date();
  const rekening = (await listRekeningAccounts()).find(
    (item) => item.id === row.rekeningId,
  );
  await prisma.salesRecord.update({
    where: { id: row.id },
    data: {
      erpPaymentStatus: "pending",
      erpPaymentError: null,
      erpPaymentAttemptedAt: attemptedAt,
    },
  });
  const paymentReference = row.erpPaymentReference || `SLM-PAY-${row.id}`.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100);
  let invoiceNumber = row.erpReference || undefined;
  let invoiceId = 0;
  let customerId = 0;
  if (shouldRecoverInvoiceReference(invoiceNumber)) {
    const customer = await resolveErpCustomerId(row.customerName, row.customerLocation || undefined);
    if (customer.success) {
      const invoice = await findErpInvoiceForCustomerPayment({
        customerId: customer.data,
        paymentDate: row.saleDate.toISOString().slice(0, 10),
        amount: Number(row.total),
      });
      if (invoice.success) {
        invoiceNumber = invoice.data.invoiceNumber || invoiceNumber;
        invoiceId = invoice.data.invoiceId || 0;
        customerId = invoice.data.customerId || customer.data;
      }
    }
  }
  const response = await syncErpSalesPayment({
    erpReference: paymentReference,
    invoiceNumber,
    invoiceId,
    customerId,
    paymentDate: row.saleDate.toISOString().slice(0, 10),
    coaCode: rekening?.erpCoaId || "",
    paymentMethod: row.paymentMethod,
    amount: Number(row.total),
    notes: `Retry payment SLM ${row.erpReference || row.id}`,
  });
  if (response.success) {
    const updated = await prisma.salesRecord.update({
      where: { id: row.id },
      data: {
        erpPaymentStatus: response.data.status,
        erpPaymentError: null,
        erpPaymentReference: response.data.paymentReference,
        erpPaymentSyncedAt: attemptedAt,
        erpPaymentAttemptedAt: attemptedAt,
        ...(invoiceNumber && invoiceNumber !== row.erpReference ? { erpReference: invoiceNumber } : {}),
      },
      include: salesInclude,
    });
    await recordAudit({
      entityType: "erp_sync",
      entityId: row.id,
      action: "retry_sync",
      afterValue: {
        erpPaymentStatus: response.data.status,
        erpPaymentReference: response.data.paymentReference,
        skipped: response.data.skipped,
      },
      reason: "Retry payment sales berhasil",
    });
    return {
      success: true,
      item: toSyncItem(updated),
      message: response.data.skipped
        ? "Invoice ERP sudah paid, payment tidak dikirim ulang."
        : "Retry payment ERP berhasil.",
    };
  }
  const error = paymentError(response);
  const updated = await prisma.salesRecord.update({
    where: { id: row.id },
    data: {
      erpPaymentStatus: "failed",
      erpPaymentError: error,
      erpPaymentAttemptedAt: attemptedAt,
    },
    include: salesInclude,
  });
  await recordAudit({
    entityType: "erp_sync",
    entityId: row.id,
    action: "retry_sync",
    afterValue: { erpPaymentStatus: "failed", error },
    reason: `Retry payment sales gagal • ${error}`,
  });
  return { success: false, item: toSyncItem(updated), message: error };
}

async function retryTempoSalesPayment(
  row: SalesRow,
): Promise<{ success: boolean; item?: ErpSyncSaleItem; message: string }> {
  const receivable = await prisma.tempoReceivable.findUnique({
    where: { salesId: row.id },
    include: {
      payments: {
        where: { erpPaymentStatus: { in: ["pending", "failed"] } },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
  const payment = receivable?.payments[0];
  if (!receivable || !payment) {
    const updated = await prisma.salesRecord.update({
      where: { id: row.id },
      data: { erpPaymentStatus: "not_required", erpPaymentError: null },
      include: salesInclude,
    });
    return {
      success: true,
      item: toSyncItem(updated),
      message: "Tidak ada pembayaran Tempo yang perlu retry.",
    };
  }
  const attemptedAt = new Date();
  const rekening = (await rekeningForTipe(receivable.tipeId)).find(
    (item) => item.id === payment.rekeningId,
  );
  await prisma.tempoPayment.update({
    where: { id: payment.id },
    data: {
      erpPaymentStatus: "pending",
      erpPaymentError: null,
      erpPaymentAttemptedAt: attemptedAt,
    },
  });
  await prisma.salesRecord.update({
    where: { id: row.id },
    data: {
      erpPaymentStatus: "pending",
      erpPaymentError: null,
      erpPaymentAttemptedAt: attemptedAt,
    },
  });
  const paymentReference = payment.erpPaymentReference || `SLM-PAY-${payment.id}`.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100);
  const response = await syncErpSalesPayment({
    erpReference: paymentReference,
    invoiceNumber: row.erpReference || undefined,
    invoiceId: 0,
    customerId: 0,
    paymentDate: payment.paymentDate.toISOString().slice(0, 10),
    coaCode: rekening?.erpCoaId || "",
    paymentMethod: payment.paymentMethod,
    amount: Number(payment.amountPaid),
    notes: `Retry payment Tempo SLM ${row.erpReference || row.id}`,
  });
  if (response.success) {
    await prisma.tempoPayment.update({
      where: { id: payment.id },
      data: {
        erpPaymentStatus: response.data.status,
        erpPaymentError: null,
        erpPaymentReference: response.data.paymentReference,
        erpPaymentSyncedAt: attemptedAt,
        erpPaymentAttemptedAt: attemptedAt,
      },
    });
    const updated = await prisma.salesRecord.update({
      where: { id: row.id },
      data: {
        erpPaymentStatus: response.data.status,
        erpPaymentError: null,
        erpPaymentReference: response.data.paymentReference,
        erpPaymentSyncedAt: attemptedAt,
        erpPaymentAttemptedAt: attemptedAt,
      },
      include: salesInclude,
    });
    await recordAudit({
      entityType: "erp_sync",
      entityId: payment.id,
      action: "retry_sync",
      afterValue: {
        erpPaymentStatus: response.data.status,
        erpPaymentReference: response.data.paymentReference,
        skipped: response.data.skipped,
      },
      reason: "Retry payment Tempo berhasil",
    });
    return {
      success: true,
      item: toSyncItem(updated),
      message: response.data.skipped
        ? "Invoice ERP sudah paid, payment Tempo tidak dikirim ulang."
        : "Retry payment Tempo ERP berhasil.",
    };
  }
  const error = paymentError(response);
  await prisma.tempoPayment.update({
    where: { id: payment.id },
    data: {
      erpPaymentStatus: "failed",
      erpPaymentError: error,
      erpPaymentAttemptedAt: attemptedAt,
    },
  });
  const updated = await prisma.salesRecord.update({
    where: { id: row.id },
    data: {
      erpPaymentStatus: "failed",
      erpPaymentError: error,
      erpPaymentAttemptedAt: attemptedAt,
    },
    include: salesInclude,
  });
  await recordAudit({
    entityType: "erp_sync",
    entityId: payment.id,
    action: "retry_sync",
    afterValue: { erpPaymentStatus: "failed", error },
    reason: `Retry payment Tempo gagal • ${error}`,
  });
  return { success: false, item: toSyncItem(updated), message: error };
}

export async function getErpSyncOverview(
  input: { page?: number; pageSize?: number } = {},
): Promise<ErpSyncOverview> {
  const delegate = salesDelegate();
  const page = cleanPage(input.page);
  const pageSize = cleanPageSize(input.pageSize);
  const emptyMeta = { page, pageSize, total: 0, totalPages: 1 };
  if (!delegate)
    return {
      summary: { pending: 0, failed: 0, synced: 0, totalErp: 0 },
      items: [],
      meta: emptyMeta,
      storageReady: false,
      warning: PRISMA_SYNC_WARNING,
    };
  const [pending, failed, synced, items] = await Promise.all([
    delegate.count({ where: { syncTarget: "erp", syncStatus: "pending" } }),
    delegate.count({
      where: {
        syncTarget: "erp",
        OR: [
          { syncStatus: "failed" },
          {
            syncStatus: "synced",
            stockReleaseStatus: { in: ["pending", "failed"] },
          },
          {
            syncStatus: "synced",
            stockReleaseStatus: "released",
            erpPaymentStatus: { in: ["pending", "failed"] },
          },
        ],
      },
    }),
    delegate.count({ where: { syncTarget: "erp", syncStatus: "synced" } }),
    delegate.findMany({
      where: {
        syncTarget: "erp",
        OR: [
          { syncStatus: { in: ["pending", "failed"] } },
          {
            syncStatus: "synced",
            stockReleaseStatus: { in: ["pending", "failed"] },
          },
          {
            syncStatus: "synced",
            stockReleaseStatus: "released",
            erpPaymentStatus: { in: ["pending", "failed"] },
          },
        ],
      },
      include: salesInclude,
      orderBy: [{ syncAttemptedAt: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const retryTotal = pending + failed;
  return {
    summary: { pending, failed, synced, totalErp: retryTotal + synced },
    items: items.map(toSyncItem),
    meta: {
      page,
      pageSize,
      total: retryTotal,
      totalPages: Math.max(1, Math.ceil(retryTotal / pageSize)),
    },
    storageReady: true,
  };
}

export async function retrySalesErpSync(
  id: string,
): Promise<{ success: boolean; item?: ErpSyncSaleItem; message: string }> {
  const delegate = salesDelegate();
  if (!delegate) return { success: false, message: PRISMA_SYNC_WARNING };
  const row = await delegate.findUnique({
    where: { id },
    include: salesInclude,
  });
  if (!row || row.syncTarget !== "erp")
    return { success: false, message: "Transaksi ERP tidak ditemukan." };
  if (
    row.syncStatus === "synced" &&
    row.stockReleaseStatus === "released" &&
    !["pending", "failed"].includes(row.erpPaymentStatus)
  )
    return {
      success: true,
      item: toSyncItem(row),
      message: "Transaksi, release stok, dan payment sudah tersinkron.",
    };

  if (row.syncStatus === "synced" && row.stockReleaseStatus !== "released") {
    const attemptedAt = new Date();
    await delegate.update({
      where: { id },
      data: { stockReleaseStatus: "pending", stockReleaseError: null },
    });
    const response = await releaseSaleStock({
      saleId: row.id,
      saleDate: row.saleDate.toISOString().slice(0, 10),
      erpReference: row.erpReference || undefined,
      sourceNumber: row.erpReference || row.id,
      items: buildRetryInput(row).items,
    });
    if (response.success) {
      const updated = await delegate.update({
        where: { id },
        data: {
          stockReleaseStatus: "released",
          stockReleaseError: null,
          stockReleaseReference: response.data.releaseReference,
          stockReleasedAt: attemptedAt,
        },
        include: salesInclude,
      });
      await recordAudit({
        entityType: "erp_sync",
        entityId: id,
        action: "retry_sync",
        afterValue: {
          stockReleaseStatus: "released",
          stockReleaseReference: response.data.releaseReference,
        },
        reason: "Retry release stok sales berhasil",
      });
      return {
        success: true,
        item: toSyncItem(updated),
        message: "Retry release stok berhasil.",
      };
    }
    const stockReleaseError = stockReleaseErrorFrom(response);
    const updated = await delegate.update({
      where: { id },
      data: { stockReleaseStatus: "failed", stockReleaseError },
      include: salesInclude,
    });
    await recordAudit({
      entityType: "erp_sync",
      entityId: id,
      action: "retry_sync",
      afterValue: {
        stockReleaseStatus: "failed",
        stockReleaseError,
        correlationId: correlationIdFromFailure(response),
      },
      reason: `Retry release stok gagal • ${stockReleaseError}`,
    });
    return {
      success: false,
      item: toSyncItem(updated),
      message: stockReleaseError || "Retry release stok gagal.",
    };
  }

  if (
    row.syncStatus === "synced" &&
    row.stockReleaseStatus === "released" &&
    ["pending", "failed"].includes(row.erpPaymentStatus)
  ) {
    return row.paymentMethod === "Tempo"
      ? retryTempoSalesPayment(row)
      : retryImmediateSalesPayment(row);
  }

  const attemptedAt = new Date();
  await delegate.update({
    where: { id },
    data: { syncStatus: "pending", syncAttemptedAt: attemptedAt },
  });
  const response = await sendOfficialSalesToErp(buildRetryInput(row));

  if (response.success) {
    const syncedAt = new Date();
    const erpReference = erpReferenceFrom(response.data);
    const stockResponse = await releaseSaleStock({
      saleId: row.id,
      saleDate: row.saleDate.toISOString().slice(0, 10),
      erpReference,
      sourceNumber: erpReference || row.id,
      items: buildRetryInput(row).items,
    });
    const stockReleaseStatus = stockResponse.success ? "released" : "failed";
    const stockReleaseError = stockResponse.success
      ? null
      : stockReleaseErrorFrom(stockResponse);
    const stockReleaseReference = stockResponse.success
      ? stockResponse.data.releaseReference
      : `SLM-STOCK-${erpReference || row.id}`
          .replace(/[^A-Za-z0-9._-]+/g, "-")
          .slice(0, 100);
    let erpPaymentStatus = isImmediatePayment(row.paymentMethod)
      ? "pending"
      : "not_required";
    let erpPaymentError: string | null = stockResponse.success
      ? null
      : "Payment ERP menunggu release stok berhasil.";
    let erpPaymentReference: string | null = null;
    let erpPaymentSyncedAt: Date | null = null;
    let erpPaymentAttemptedAt: Date | null = null;
    if (stockResponse.success && isImmediatePayment(row.paymentMethod)) {
      const rekening = (await listRekeningAccounts()).find(
        (item) => item.id === row.rekeningId,
      );
      erpPaymentAttemptedAt = new Date();
      const paymentResponse = await syncErpSalesPayment({
        erpReference: row.erpPaymentReference || `SLM-PAY-${row.id}`.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100),
        invoiceNumber: erpReference,
        invoiceId: 0,
        customerId: 0,
        paymentDate: row.saleDate.toISOString().slice(0, 10),
        coaCode: rekening?.erpCoaId || "",
        paymentMethod: row.paymentMethod,
        amount: Number(row.total),
        notes: `Retry payment SLM ${erpReference || row.id}`,
      });
      if (paymentResponse.success) {
        erpPaymentStatus = paymentResponse.data.status;
        erpPaymentError = null;
        erpPaymentReference = paymentResponse.data.paymentReference || null;
        erpPaymentSyncedAt = erpPaymentAttemptedAt;
      } else {
        erpPaymentStatus = "failed";
        erpPaymentError = paymentError(paymentResponse);
      }
    }
    const updated = await delegate.update({
      where: { id },
      data: {
        syncStatus: "synced",
        syncError: null,
        syncAttemptedAt: attemptedAt,
        syncedAt,
        erpReference,
        stockReleaseStatus,
        stockReleaseError,
        stockReleaseReference,
        stockReleasedAt: stockResponse.success ? syncedAt : null,
        erpPaymentStatus,
        erpPaymentError,
        erpPaymentReference,
        erpPaymentSyncedAt,
        erpPaymentAttemptedAt,
      },
      include: salesInclude,
    });
    await recordAudit({
      entityType: "erp_sync",
      entityId: id,
      action: "retry_sync",
      afterValue: {
        syncStatus: "synced",
        erpReference,
        stockReleaseStatus,
        stockReleaseReference,
        stockReleaseError,
        erpPaymentStatus,
        erpPaymentReference,
        erpPaymentError,
      },
      reason: stockResponse.success
        ? `Retry ERP sales dan release stok berhasil • Payment ${erpPaymentStatus}`
        : `Retry ERP sales berhasil • release stok gagal • ${stockReleaseError}`,
    });
    return {
      success:
        stockResponse.success &&
        !["pending", "failed"].includes(erpPaymentStatus),
      item: toSyncItem(updated),
      message: stockResponse.success
        ? ["pending", "failed"].includes(erpPaymentStatus)
          ? erpPaymentError || "Retry payment ERP belum berhasil."
          : "Retry ERP, release stok, dan payment berhasil."
        : stockReleaseError || "Retry release stok gagal.",
    };
  }

  const syncError = safeErpSyncError(response);
  const updated = await delegate.update({
    where: { id },
    data: { syncStatus: "failed", syncError, syncAttemptedAt: attemptedAt },
    include: salesInclude,
  });
  await recordAudit({
    entityType: "erp_sync",
    entityId: id,
    action: "retry_sync",
    afterValue: {
      syncStatus: "failed",
      syncError,
      correlationId: correlationIdFromFailure(response),
    },
    reason: `Retry ERP sales gagal • ${syncError}`,
  });
  return {
    success: false,
    item: toSyncItem(updated),
    message: syncError || "Retry ERP gagal.",
  };
}

export async function retryPendingSalesErpSync(limit = 25) {
  const delegate = salesDelegate();
  if (!delegate)
    return {
      attempted: 0,
      succeeded: 0,
      failed: 1,
      results: [
        { id: "sales-storage", success: false, message: PRISMA_SYNC_WARNING },
      ],
    };
  const rows = await delegate.findMany({
    where: {
      syncTarget: "erp",
      OR: [
        { syncStatus: { in: ["pending", "failed"] } },
        {
          syncStatus: "synced",
          stockReleaseStatus: { in: ["pending", "failed"] },
        },
        {
          syncStatus: "synced",
          stockReleaseStatus: "released",
          erpPaymentStatus: { in: ["pending", "failed"] },
        },
      ],
    },
    select: { id: true },
    orderBy: [{ syncAttemptedAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
  const results = [];
  for (const row of rows)
    results.push({ id: row.id, ...(await retrySalesErpSync(row.id)) });
  return {
    attempted: results.length,
    succeeded: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  };
}
