import type { Sale } from "@/lib/types/sales";
import type { TempoPayment, TempoReceivable } from "@/lib/tempo/store";

export const DOT_MATRIX_WIDTH = 80;

type TempoPrintInput = {
  receivable: TempoReceivable;
  payments: TempoPayment[];
};

function clamp(text: string, width = DOT_MATRIX_WIDTH) {
  return text.length > width ? text.slice(0, width) : text;
}

function line(char = "-") {
  return char.repeat(DOT_MATRIX_WIDTH);
}

function center(text: string) {
  const clean = clamp(text.trim());
  const left = Math.floor((DOT_MATRIX_WIDTH - clean.length) / 2);
  return `${" ".repeat(Math.max(0, left))}${clean}`.padEnd(DOT_MATRIX_WIDTH);
}

function pair(label: string, value?: string | number) {
  const left = `${label}:`;
  const right = value === undefined || value === null || value === "" ? "-" : String(value);
  return clamp(`${left.padEnd(18)} ${right}`);
}

function money(value?: number) {
  return `Rp ${Math.round(value || 0).toLocaleString("id-ID")}`;
}

function amountLine(label: string, value: number) {
  const right = money(value);
  return clamp(`${label.padEnd(DOT_MATRIX_WIDTH - right.length)}${right}`);
}

function itemLine(name: string, quantity: number, unitPrice: number, discount = 0) {
  const total = quantity * unitPrice - discount;
  const left = clamp(name, 34).padEnd(34);
  const middle = `${quantity} x ${money(unitPrice)}`.padEnd(24);
  const right = money(total).padStart(20);
  return clamp(`${left}${middle}${right}`);
}

function normalizeLines(lines: string[]) {
  return `${lines.map((entry) => clamp(entry).padEnd(DOT_MATRIX_WIDTH)).join("\n")}\n`;
}

export function formatSaleDotMatrix(sale: Sale) {
  const rows: string[] = [
    center("ANEKA JAYA"),
    center("BUKTI TRANSAKSI PENJUALAN"),
    line("="),
    pair("No Transaksi", sale.id),
    pair("Tanggal", sale.saleDate),
    pair("Customer", sale.customerName),
    pair("Lokasi", sale.customerLocation),
    pair("Pembayaran", sale.paymentMethod),
    pair("Status", sale.approvalStatus || "-"),
    sale.paymentMethod === "Tempo" ? pair("Jatuh Tempo", sale.dueDate) : "",
    line("-"),
    `${"Barang".padEnd(34)}${"Qty x Harga".padEnd(24)}${"Total".padStart(20)}`,
    line("-"),
    ...sale.items.map((item) => itemLine(item.productRef, item.quantity, item.unitPrice, item.discount || 0)),
    line("-"),
    amountLine("TOTAL", sale.total),
    line("="),
    center("Preview dot matrix 80 kolom"),
    center("Gunakan font monospace saat mencetak")
  ].filter(Boolean);

  return normalizeLines(rows);
}

export function formatTempoPaymentDotMatrix({ receivable, payments }: TempoPrintInput) {
  const latestPayment = payments[0];
  const rows: string[] = [
    center("ANEKA JAYA"),
    center("BUKTI PEMBAYARAN TEMPO"),
    line("="),
    pair("No Tempo", receivable.id),
    pair("No Penjualan", receivable.salesId),
    pair("Customer", receivable.customerName),
    pair("Tanggal Tempo", receivable.transactionDate),
    pair("Jatuh Tempo", receivable.dueDate),
    pair("Status", receivable.status),
    line("-"),
    amountLine("TOTAL TEMPO", receivable.originalAmount),
    amountLine("SUDAH DIBAYAR", receivable.paidAmount),
    amountLine("SISA TEMPO", receivable.remainingAmount),
    line("-")
  ];

  if (latestPayment) {
    rows.push(
      pair("Pembayaran", latestPayment.id),
      pair("Tanggal Bayar", latestPayment.paymentDate),
      pair("Metode", latestPayment.paymentMethod),
      pair("Rekening", latestPayment.rekeningNameSnapshot || latestPayment.rekeningId),
      amountLine("NOMINAL BAYAR", latestPayment.amountPaid)
    );
  } else {
    rows.push(center("Belum ada pembayaran tercatat"));
  }

  rows.push(line("="), center("Preview dot matrix 80 kolom"), center("Gunakan font monospace saat mencetak"));
  return normalizeLines(rows);
}
