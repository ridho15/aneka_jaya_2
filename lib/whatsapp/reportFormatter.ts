import "server-only";
import { listTempoReceivables, type TempoReceivable } from "@/lib/tempo/store";
import { APP_BRAND_NAME } from "@/lib/appBrand";
import { formatJakartaDate, jakartaDateKey } from "@/lib/date/jakarta";
import { getPaidSalesReport } from "@/lib/reports/store";
import type { PaidSalesReport } from "@/lib/reports/summary";

const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const ddmmyyyy = (value: string | Date) => formatJakartaDate(value);

export async function formatDailyReport(date = new Date()) {
  const reportDate = jakartaDateKey(date);
  const report = await getPaidSalesReport(reportDate);
  const openTempo = (await listTempoReceivables()).filter((tempo) => !["paid", "cancelled", "written_off"].includes(tempo.status));
  return formatDailyReportText(report, openTempo, date);
}

export function formatDailyReportText(report: PaidSalesReport, openTempo: TempoReceivable[], date: string | Date = report.reportDate) {
  const sections = [`Laporan Harian ${APP_BRAND_NAME} - ${ddmmyyyy(date)}`, "", `Grand Total: ${rupiah(report.grandTotal)}`, "(exclude tempo)", ""];
  if (!report.paidSales.length) sections.push("Tidak ada transaksi paid hari ini", "");
  report.byTipe.forEach((totals) => sections.push(totals.tipe, `Cash: ${rupiah(totals.cash)}`, `TF: ${rupiah(totals.tf)}`, ""));
  if (report.unsyncedErpCount > 0) sections.push("AJ belum tersinkron ERP:", `${report.unsyncedErpCount} transaksi - ${rupiah(report.unsyncedErpTotal)}`, "");
  sections.push("Tempo:");
  if (!openTempo.length) sections.push("Tidak ada");
  openTempo.forEach((tempo, index) => sections.push(`${index + 1}. ${formatTempoLine(tempo)}`));
  return sections.join("\n");
}

export async function formatTempoReminderReport(date = new Date()) {
  const today = new Date(`${jakartaDateKey(date)}T00:00:00+07:00`);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 14);
  const rows = (await listTempoReceivables()).filter((tempo) => !["paid", "cancelled", "written_off"].includes(tempo.status));
  const dueSoon = rows.filter((tempo) => new Date(tempo.dueDate) >= today && new Date(tempo.dueDate) <= limit);
  const overdue = rows.filter((tempo) => new Date(tempo.dueDate) < today);
  if (!dueSoon.length && !overdue.length) return null;
  const lines = [`Laporan Jatuh Tempo - ${ddmmyyyy(date)}`, "", "Jatuh tempo dalam 14 hari:"];
  dueSoon.forEach((tempo, index) => lines.push(`${index + 1}. ${tempo.customerName} - ${rupiah(tempo.remainingAmount)} - Jatuh tempo: ${ddmmyyyy(tempo.dueDate)} - Tipe: ${tempo.tipeCodeSnapshot}`));
  if (overdue.length) {
    lines.push("", "Overdue:");
    overdue.forEach((tempo, index) => {
      const lateDays = Math.max(1, Math.floor((today.getTime() - new Date(tempo.dueDate).getTime()) / 86_400_000));
      lines.push(`${index + 1}. ${tempo.customerName} - ${rupiah(tempo.remainingAmount)} - Telat ${lateDays} hari - Tipe: ${tempo.tipeCodeSnapshot}`);
    });
  }
  return lines.join("\n");
}

function formatTempoLine(tempo: TempoReceivable) {
  if (tempo.status === "partial_paid") return `${tempo.customerName} - ${rupiah(tempo.remainingAmount)} remaining from ${rupiah(tempo.originalAmount)} - Jatuh tempo: ${ddmmyyyy(tempo.dueDate)}`;
  return `${tempo.customerName} - ${rupiah(tempo.remainingAmount)} - Jatuh tempo: ${ddmmyyyy(tempo.dueDate)}`;
}
