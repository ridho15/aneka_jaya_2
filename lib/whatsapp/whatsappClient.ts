import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/store";
import { sendMetaCloudApi } from "./providers/metaCloudApi";
import { sendThirdPartyProvider } from "./providers/thirdPartyProvider";
import type {
  WhatsAppMessageLog,
  WhatsAppProviderName,
  WhatsAppProviderStatus,
  WhatsAppRecipient,
  WhatsAppRecipientInput,
  WhatsAppReportType
} from "./types";

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function maskWhatsappPhone(value: unknown) {
  const text = String(value ?? "").replace(/[^\d+]/g, "");
  if (text.length <= 4) return "***";
  return `${text.slice(0, 2)}***${text.slice(-3)}`;
}

function normalizePhone(value: string) {
  return value.trim().replace(/[^\d+]/g, "");
}

function safeErrorMessage(value: unknown) {
  const text = String(value || "WhatsApp gagal dikirim.");
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

function toRecipient(row: {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  receivesDailyReport: boolean;
  receivesStockAlert: boolean;
  receivesTempoReminder: boolean;
  createdAt: Date;
  updatedAt: Date;
}): WhatsAppRecipient {
  return {
    id: row.id,
    name: row.name,
    phoneNumber: row.phone,
    isActive: row.isActive,
    receivesDailyReport: row.receivesDailyReport,
    receivesStockAlert: row.receivesStockAlert,
    receivesTempoReminder: row.receivesTempoReminder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toLog(row: {
  id: string;
  recipientId: string | null;
  recipient: string;
  messageType: string;
  status: string;
  reportType: string | null;
  provider: string | null;
  recipientNameSnapshot: string | null;
  phoneMaskedSnapshot: string | null;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
}): WhatsAppMessageLog {
  return {
    id: row.id,
    reportType: (row.reportType || row.messageType) as WhatsAppReportType,
    recipientId: row.recipientId || undefined,
    recipientNameSnapshot: row.recipientNameSnapshot || row.recipient,
    phoneMaskedSnapshot: row.phoneMaskedSnapshot || maskWhatsappPhone(row.recipient),
    provider: (row.provider || "not_configured") as WhatsAppMessageLog["provider"],
    status: row.status === "sent" ? "sent" : row.status === "pending" ? "pending" : "failed",
    providerMessageId: row.providerMessageId || undefined,
    errorMessage: row.errorMessage || undefined,
    sentAt: row.sentAt ? row.sentAt.toISOString() : undefined,
    createdAt: row.createdAt.toISOString()
  };
}

export function getWhatsappProvider(): WhatsAppProviderName | null {
  const provider = process.env.WHATSAPP_PROVIDER;
  if (provider === "meta_cloud_api" || provider === "third_party") return provider;
  return null;
}

export function getWhatsappProviderStatus(): WhatsAppProviderStatus {
  const provider = getWhatsappProvider();
  if (!provider) return {
    provider: null,
    ready: false,
    label: "Belum dikonfigurasi",
    message: "WHATSAPP_PROVIDER belum diisi.",
    missing: ["WHATSAPP_PROVIDER"]
  };
  const missing = provider === "meta_cloud_api"
    ? [
        !process.env.WHATSAPP_CLOUD_API_TOKEN?.trim() ? "WHATSAPP_CLOUD_API_TOKEN" : null,
        !process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ? "WHATSAPP_PHONE_NUMBER_ID" : null
      ].filter(Boolean) as string[]
    : [
        !process.env.WHATSAPP_THIRD_PARTY_ENDPOINT?.trim() ? "WHATSAPP_THIRD_PARTY_ENDPOINT" : null,
        !process.env.WHATSAPP_THIRD_PARTY_TOKEN?.trim() ? "WHATSAPP_THIRD_PARTY_TOKEN" : null
      ].filter(Boolean) as string[];
  return {
    provider,
    ready: missing.length === 0,
    label: missing.length === 0 ? "Siap" : "Konfigurasi belum lengkap",
    message: missing.length === 0 ? `Provider ${provider} siap digunakan.` : `${missing.join(", ")} belum dikonfigurasi.`,
    missing
  };
}

export async function listWhatsappRecipients() {
  const rows = await prisma.whatsAppRecipient.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  return rows.map(toRecipient);
}

export async function createWhatsappRecipient(input: WhatsAppRecipientInput) {
  const row = await prisma.whatsAppRecipient.create({
    data: {
      id: `WA-R-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      phone: normalizePhone(input.phoneNumber),
      isActive: input.isActive ?? true,
      receivesDailyReport: input.receivesDailyReport ?? false,
      receivesStockAlert: input.receivesStockAlert ?? false,
      receivesTempoReminder: input.receivesTempoReminder ?? false
    }
  });
  const recipient = toRecipient(row);
  await recordAudit({
    entityType: "whatsapp_report",
    entityId: recipient.id,
    action: "create",
    afterValue: { ...recipient, phoneNumber: maskWhatsappPhone(recipient.phoneNumber) },
    reason: "Tambah recipient WhatsApp"
  });
  return recipient;
}

export async function updateWhatsappRecipient(id: string, input: Partial<WhatsAppRecipientInput>) {
  const before = await prisma.whatsAppRecipient.findUnique({ where: { id } });
  if (!before) throw new Error("Recipient WhatsApp tidak ditemukan.");
  const row = await prisma.whatsAppRecipient.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      phone: input.phoneNumber ? normalizePhone(input.phoneNumber) : undefined,
      isActive: input.isActive,
      receivesDailyReport: input.receivesDailyReport,
      receivesStockAlert: input.receivesStockAlert,
      receivesTempoReminder: input.receivesTempoReminder
    }
  });
  const recipient = toRecipient(row);
  await recordAudit({
    entityType: "whatsapp_report",
    entityId: recipient.id,
    action: recipient.isActive ? "update" : "disable",
    beforeValue: { ...toRecipient(before), phoneNumber: maskWhatsappPhone(before.phone) },
    afterValue: { ...recipient, phoneNumber: maskWhatsappPhone(recipient.phoneNumber) },
    reason: recipient.isActive ? "Update recipient WhatsApp" : "Nonaktifkan recipient WhatsApp"
  });
  return recipient;
}

export async function listWhatsappLogs(limit = 25) {
  const rows = await prisma.whatsAppMessageLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toLog);
}

async function createMessageLog(recipient: WhatsAppRecipient, reportType: WhatsAppReportType, provider: WhatsAppProviderName | null) {
  const maskedPhone = maskWhatsappPhone(recipient.phoneNumber);
  const row = await prisma.whatsAppMessageLog.create({
    data: {
      id: `WA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      recipientId: recipient.id,
      recipient: recipient.name,
      messageType: reportType,
      status: "pending",
      reportType,
      provider: provider || "not_configured",
      recipientNameSnapshot: recipient.name,
      phoneMaskedSnapshot: maskedPhone,
      payload: { sanitized: true, reportType, recipient: recipient.name, phone: maskedPhone }
    }
  });
  return toLog(row);
}

export async function sendWhatsappMessage(recipient: WhatsAppRecipient, reportType: WhatsAppReportType, messageBody: string) {
  const provider = getWhatsappProvider();
  const pending = await createMessageLog(recipient, reportType, provider);
  if (!provider) {
    const errorMessage = "Provider WhatsApp belum dikonfigurasi.";
    const failed = await prisma.whatsAppMessageLog.update({
      where: { id: pending.id },
      data: { status: "failed", errorMessage, response: { status: "failed", errorMessage } }
    });
    return toLog(failed);
  }
  const result = provider === "meta_cloud_api"
    ? await sendMetaCloudApi({ to: recipient.phoneNumber, body: messageBody })
    : await sendThirdPartyProvider({ to: recipient.phoneNumber, body: messageBody });
  const finalLog = await prisma.whatsAppMessageLog.update({
    where: { id: pending.id },
    data: {
      status: result.status,
      providerMessageId: result.providerMessageId,
      errorMessage: result.errorMessage ? safeErrorMessage(result.errorMessage) : null,
      sentAt: result.status === "sent" ? new Date() : null,
      response: {
        status: result.status,
        provider,
        providerMessageId: result.providerMessageId,
        errorMessage: result.errorMessage ? safeErrorMessage(result.errorMessage) : undefined
      }
    }
  });
  const log = toLog(finalLog);
  await recordAudit({
    entityType: "whatsapp_report",
    entityId: log.id,
    action: "send_whatsapp",
    afterValue: {
      reportType,
      provider,
      status: log.status,
      recipientNameSnapshot: log.recipientNameSnapshot,
      phoneMaskedSnapshot: log.phoneMaskedSnapshot,
      providerMessageId: log.providerMessageId,
      errorMessage: log.errorMessage,
      createdAt: log.createdAt,
      sentAt: log.sentAt
    },
    reason: `${reportType} • ${log.status} • ${provider}`
  });
  return log;
}

export function summarizeWhatsappResults(results: Array<PromiseSettledResult<WhatsAppMessageLog>>) {
  return {
    sent: results.filter((result) => result.status === "fulfilled" && result.value.status === "sent").length,
    failed: results.filter((result) => result.status === "rejected" || (result.status === "fulfilled" && result.value.status === "failed")).length,
    skipped: 0,
    results: results.map((result) => result.status === "fulfilled"
      ? result.value
      : { id: `WA-ERR-${Date.now()}`, reportType: "test" as WhatsAppReportType, recipientNameSnapshot: "-", phoneMaskedSnapshot: "***", provider: "not_configured" as const, status: "failed" as const, errorMessage: safeErrorMessage(result.reason), createdAt: new Date().toISOString() })
  };
}
