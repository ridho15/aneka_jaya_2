import "server-only";
import { readJsonArray, writeJsonArray } from "@/lib/data/jsonStore";
import { recordAudit } from "@/lib/audit/store";
import { sendMetaCloudApi } from "./providers/metaCloudApi";
import { sendThirdPartyProvider } from "./providers/thirdPartyProvider";
import type { WhatsAppMessageLog, WhatsAppProviderName, WhatsAppRecipient, WhatsAppReportType } from "./types";

const recipientFile = "whatsapp-recipients.json";
const logFile = "whatsapp-message-logs.json";

export function getWhatsappProvider(): WhatsAppProviderName | null {
  const provider = process.env.WHATSAPP_PROVIDER;
  if (provider === "meta_cloud_api" || provider === "third_party") return provider;
  return null;
}

export async function listWhatsappRecipients() {
  const rows = await readJsonArray<WhatsAppRecipient>(recipientFile);
  return rows;
}

export async function saveWhatsappRecipients(rows: WhatsAppRecipient[]) {
  await writeJsonArray(recipientFile, rows);
}

export async function listWhatsappLogs() {
  return readJsonArray<WhatsAppMessageLog>(logFile);
}

export async function sendWhatsappMessage(recipient: WhatsAppRecipient, reportType: WhatsAppReportType, messageBody: string) {
  const provider = getWhatsappProvider();
  if (!provider) throw new Error("Provider WhatsApp belum dikonfigurasi.");
  const pending: WhatsAppMessageLog = {
    id: `WA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    reportType,
    recipientId: recipient.id,
    recipientNameSnapshot: recipient.name,
    phoneNumberSnapshot: recipient.phoneNumber,
    messageBody,
    provider,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  const logs = await readJsonArray<WhatsAppMessageLog>(logFile);
  logs.unshift(pending);
  await writeJsonArray(logFile, logs);
  const result = provider === "meta_cloud_api"
    ? await sendMetaCloudApi({ to: recipient.phoneNumber, body: messageBody })
    : await sendThirdPartyProvider({ to: recipient.phoneNumber, body: messageBody });
  const finalLog: WhatsAppMessageLog = { ...pending, status: result.status, providerMessageId: result.providerMessageId, errorMessage: result.errorMessage, sentAt: result.status === "sent" ? new Date().toISOString() : undefined };
  logs[0] = finalLog;
  await writeJsonArray(logFile, logs);
  await recordAudit({
    entityType: "whatsapp_report",
    entityId: finalLog.id,
    action: "send_whatsapp",
    afterValue: {
      reportType,
      provider,
      status: finalLog.status,
      recipientNameSnapshot: finalLog.recipientNameSnapshot,
      phoneNumberSnapshot: finalLog.phoneNumberSnapshot,
      providerMessageId: finalLog.providerMessageId,
      errorMessage: finalLog.errorMessage,
      createdAt: finalLog.createdAt,
      sentAt: finalLog.sentAt
    },
    reason: `${reportType} • ${result.status} • ${provider}`
  });
  return finalLog;
}
