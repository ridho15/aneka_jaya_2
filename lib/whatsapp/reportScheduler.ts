import "server-only";
import { listWhatsappRecipients, sendWhatsappMessage } from "./whatsappClient";
import { formatDailyReport, formatTempoReminderReport } from "./reportFormatter";
import { checkAllStockAlerts } from "@/lib/stockAlerts/scheduler";

export async function sendDailyReportJob() {
  const body = await formatDailyReport(new Date());
  const recipients = (await listWhatsappRecipients()).filter((recipient) => recipient.isActive && recipient.receivesDailyReport);
  return Promise.all(recipients.map((recipient) => sendWhatsappMessage(recipient, "daily_report", body)));
}

export async function sendTempoReminderJob() {
  const body = await formatTempoReminderReport(new Date());
  if (!body) return [];
  const recipients = (await listWhatsappRecipients()).filter((recipient) => recipient.isActive && recipient.receivesTempoReminder);
  return Promise.all(recipients.map((recipient) => sendWhatsappMessage(recipient, "tempo_reminder", body)));
}

export async function checkStockAlertJob() {
  return checkAllStockAlerts();
}
