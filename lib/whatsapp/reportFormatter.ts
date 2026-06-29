import "server-only";
import { listTempoReceivables, type TempoReceivable } from "@/lib/tempo/store";
import { listSalesRecords } from "@/lib/sales/store";

const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const ddmmyyyy = (value: string | Date) => new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
type PaidPaymentMethod = "Cash" | "TF";
const isPaidPaymentMethod = (value: string): value is PaidPaymentMethod => value === "Cash" || value === "TF";

export async function formatDailyReport(date = new Date()) {
  const reportDate = date.toISOString().slice(0, 10);
  const sales = await listSalesRecords();
  const paidSales = sales.filter((sale) => sale.saleDate === reportDate && isPaidPaymentMethod(sale.paymentMethod) && (!sale.approvalStatus || sale.approvalStatus === "approved"));
  const grandTotal = paidSales.reduce((sum, sale) => sum + sale.total, 0);
  const byTipe = new Map<string, { Cash: number; TF: number }>();
  for (const sale of paidSales) {
    if (!isPaidPaymentMethod(sale.paymentMethod)) continue;
    const key = sale.tipeCodeSnapshot || "W";
    const current = byTipe.get(key) || { Cash: 0, TF: 0 };
    current[sale.paymentMethod] += sale.total;
    byTipe.set(key, current);
  }
  const openTempo = (await listTempoReceivables()).filter((tempo) => !["paid", "cancelled", "written_off"].includes(tempo.status));
  const sections = [`Laporan Harian Aneka Jaya - ${ddmmyyyy(date)}`, "", `Grand Total: ${rupiah(grandTotal)}`, "(exclude tempo)", ""];
  if (!paidSales.length) sections.push("Tidak ada transaksi paid hari ini", "");
  byTipe.forEach((totals, tipe) => sections.push(tipe, `Cash: ${rupiah(totals.Cash)}`, `TF: ${rupiah(totals.TF)}`, ""));
  sections.push("Tempo:");
  if (!openTempo.length) sections.push("Tidak ada");
  openTempo.forEach((tempo, index) => sections.push(`${index + 1}. ${formatTempoLine(tempo)}`));
  return sections.join("\n");
}

export async function formatTempoReminderReport(date = new Date()) {
  const today = new Date(date.toISOString().slice(0, 10));
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
