import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/store";
import type { Product } from "@/lib/types/product";
import type { StockItem } from "@/lib/types/stock";
import { listWhatsappRecipients, sendWhatsappMessage } from "@/lib/whatsapp/whatsappClient";

export type StockAlertLog = {
  id: string;
  productId?: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  currentStock: number;
  minimumStock: number;
  warehouseSnapshot?: string;
  rackSnapshot?: string;
  status: "sent" | "failed" | "resolved";
  sentAt?: string;
  resolvedAt?: string;
  createdAt: string;
};

function mapPrismaStockAlertLog(row: {
  id: string;
  productRef: string;
  productName: string;
  currentQuantity: number;
  minimumQuantity: number;
  status: string;
  sentTo: string | null;
  createdAt: Date;
}): StockAlertLog {
  const status = (row.status as StockAlertLog["status"]) || "failed";
  return {
    id: row.id,
    productId: row.productRef,
    productCodeSnapshot: row.productRef,
    productNameSnapshot: row.productName,
    currentStock: row.currentQuantity,
    minimumStock: row.minimumQuantity,
    status,
    sentAt: status === "sent" ? row.createdAt.toISOString() : undefined,
    createdAt: row.createdAt.toISOString()
  };
}

export async function listStockAlertLogs(): Promise<StockAlertLog[]> {
  const rows = await prisma.stockAlertLog.findMany({
    orderBy: { createdAt: "desc" }
  });
  return rows.map(mapPrismaStockAlertLog);
}

export async function checkStockMinimumAlert(input: Product | StockItem): Promise<StockAlertLog | null> {
  const currentStock = "quantity" in input ? input.quantity : input.initialStock ?? null;
  const minimumStock = input.minimumStock ?? null;
  const productCode = "productCode" in input ? input.productCode : input.code;
  const productName = "productName" in input ? input.productName : input.name;
  const productId = input.id;

  if (
    currentStock === null ||
    minimumStock === null ||
    !Number.isFinite(currentStock) ||
    !Number.isFinite(minimumStock) ||
    minimumStock <= 0
  ) {
    return null;
  }

  const openAlert = await prisma.stockAlertLog.findFirst({
    where: {
      productRef: productCode,
      status: { not: "resolved" }
    },
    orderBy: { createdAt: "desc" }
  });

  if (currentStock > minimumStock) {
    if (openAlert) {
      await prisma.stockAlertLog.updateMany({
        where: {
          productRef: productCode,
          status: { not: "resolved" }
        },
        data: {
          status: "resolved"
        }
      });
    }
    return null;
  }

  if (openAlert) {
    return mapPrismaStockAlertLog(openAlert);
  }

  const alertPayload = {
    id: `SAL-${Date.now()}`,
    productId,
    productCodeSnapshot: productCode,
    productNameSnapshot: productName,
    currentStock,
    minimumStock,
    warehouseSnapshot: input.warehouse ?? undefined,
    rackSnapshot: "rack" in input ? input.rack : undefined
  };

  const message = [
    `Laporan Stock Akan Habis - ${new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta"
    }).format(new Date())}`,
    "",
    `1. ${alertPayload.productCodeSnapshot} - ${alertPayload.productNameSnapshot}`,
    `Stock sekarang: ${alertPayload.currentStock}`,
    `Minimum stock: ${alertPayload.minimumStock}`,
    `Gudang: ${alertPayload.warehouseSnapshot || "-"}`,
    `Rak: ${alertPayload.rackSnapshot || "-"}`
  ].join("\n");

  const recipients = (await listWhatsappRecipients()).filter(
    (recipient) => recipient.isActive && recipient.receivesStockAlert
  );
  const sends = await Promise.allSettled(
    recipients.map((recipient) => sendWhatsappMessage(recipient, "stock_alert", message))
  );
  const sent =
    sends.length > 0 &&
    sends.every((send) => send.status === "fulfilled" && send.value.status === "sent");

  const status: "sent" | "failed" = sent ? "sent" : "failed";
  const sentTo = recipients.map((r) => r.phoneNumber || r.name).filter(Boolean).join(", ") || null;

  const createdRow = await prisma.stockAlertLog.create({
    data: {
      id: alertPayload.id,
      productRef: productCode,
      productName,
      currentQuantity: Math.round(currentStock),
      minimumQuantity: Math.round(minimumStock),
      status,
      sentTo,
      createdAt: new Date()
    }
  });

  const alertResult = mapPrismaStockAlertLog(createdRow);
  if (alertPayload.warehouseSnapshot) alertResult.warehouseSnapshot = alertPayload.warehouseSnapshot;
  if (alertPayload.rackSnapshot) alertResult.rackSnapshot = alertPayload.rackSnapshot;

  await recordAudit({
    entityType: "stock_alert",
    entityId: alertResult.id,
    action: "send_whatsapp",
    afterValue: alertResult,
    reason: "Stock sudah mencapai minimum"
  });

  return alertResult;
}
