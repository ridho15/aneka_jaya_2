import "server-only";
import { recordAudit } from "@/lib/audit/store";
import { readJsonArray, writeJsonArray } from "@/lib/data/jsonStore";
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

const fileName = "stock-alert-logs.json";

export async function listStockAlertLogs() {
  return readJsonArray<StockAlertLog>(fileName);
}

export async function checkStockMinimumAlert(input: Product | StockItem) {
  const currentStock = "quantity" in input ? input.quantity : input.initialStock ?? null;
  const minimumStock = input.minimumStock ?? null;
  const productCode = "productCode" in input ? input.productCode : input.code;
  const productName = "productName" in input ? input.productName : input.name;
  const productId = input.id;
  if (currentStock === null || minimumStock === null || !Number.isFinite(currentStock) || !Number.isFinite(minimumStock) || minimumStock <= 0) return null;
  const rows = await readJsonArray<StockAlertLog>(fileName);
  const openAlertIndex = rows.findIndex((row) => row.productCodeSnapshot === productCode && row.status !== "resolved");
  if (currentStock > minimumStock) {
    if (openAlertIndex >= 0) {
      rows[openAlertIndex] = { ...rows[openAlertIndex], status: "resolved", resolvedAt: new Date().toISOString() };
      await writeJsonArray(fileName, rows);
    }
    return null;
  }
  if (openAlertIndex >= 0) return rows[openAlertIndex];
  let alert: StockAlertLog = {
    id: `SAL-${Date.now()}`,
    productId,
    productCodeSnapshot: productCode,
    productNameSnapshot: productName,
    currentStock,
    minimumStock,
    warehouseSnapshot: input.warehouse ?? undefined,
    rackSnapshot: "rack" in input ? input.rack : undefined,
    status: "failed",
    createdAt: new Date().toISOString()
  };
  const message = [
    `Laporan Stock Akan Habis - ${new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date())}`,
    "",
    `1. ${alert.productCodeSnapshot} - ${alert.productNameSnapshot}`,
    `Stock sekarang: ${alert.currentStock}`,
    `Minimum stock: ${alert.minimumStock}`,
    `Gudang: ${alert.warehouseSnapshot || "-"}`,
    `Rak: ${alert.rackSnapshot || "-"}`
  ].join("\n");
  const recipients = (await listWhatsappRecipients()).filter((recipient) => recipient.isActive && recipient.receivesStockAlert);
  const sends = await Promise.allSettled(recipients.map((recipient) => sendWhatsappMessage(recipient, "stock_alert", message)));
  const sent = sends.length > 0 && sends.every((send) => send.status === "fulfilled" && send.value.status === "sent");
  alert = { ...alert, status: sent ? "sent" : "failed", sentAt: sent ? new Date().toISOString() : undefined };
  rows.unshift(alert);
  await writeJsonArray(fileName, rows);
  await recordAudit({ entityType: "stock_alert", entityId: alert.id, action: "send_whatsapp", afterValue: alert, reason: "Stock sudah mencapai minimum" });
  return alert;
}
