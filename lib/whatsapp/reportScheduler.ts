import "server-only";
import { listWhatsappRecipients, sendWhatsappMessage, summarizeWhatsappResults } from "./whatsappClient";
import { formatDailyReport, formatTempoReminderReport } from "./reportFormatter";
import { checkAllStockAlerts } from "@/lib/stockAlerts/scheduler";

export async function sendDailyReportJob() {
  const body = await formatDailyReport(new Date());
  const recipients = (await listWhatsappRecipients()).filter((recipient) => recipient.isActive && recipient.receivesDailyReport);
  const results = await Promise.allSettled(recipients.map((recipient) => sendWhatsappMessage(recipient, "daily_report", body)));
  return { ...summarizeWhatsappResults(results), skipped: recipients.length === 0 ? 1 : 0 };
}

export async function sendTempoReminderJob() {
  const body = await formatTempoReminderReport(new Date());
  if (!body) return { sent: 0, failed: 0, skipped: 1, results: [] };
  const recipients = (await listWhatsappRecipients()).filter((recipient) => recipient.isActive && recipient.receivesTempoReminder);
  const results = await Promise.allSettled(recipients.map((recipient) => sendWhatsappMessage(recipient, "tempo_reminder", body)));
  return { ...summarizeWhatsappResults(results), skipped: recipients.length === 0 ? 1 : 0 };
}

export async function checkStockAlertJob() {
  return checkAllStockAlerts();
}
