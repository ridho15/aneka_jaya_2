import type { Sale } from "@/lib/types/sales";
import type { Expense } from "@/lib/types/expenses";
import type { TempoPayment, TempoReceivable } from "@/lib/tempo/store";

export const DOT_MATRIX_WIDTH = 44;
const LEFT_HEADER_WIDTH = 21;
const RIGHT_HEADER_WIDTH = DOT_MATRIX_WIDTH - LEFT_HEADER_WIDTH - 1;
const SIGNATURE_WIDTH = 24;

type TempoPrintInput = {
  receivable: TempoReceivable;
  payments: TempoPayment[];
};

export function truncate(text: string | number | undefined | null, width = DOT_MATRIX_WIDTH) {
  const value = text === undefined || text === null || text === "" ? "-" : String(text);
  return value.length > width ? value.slice(0, width) : value;
}

export function column(text: string | number | undefined | null, width: number, align: "left" | "right" = "left") {
  const value = truncate(text, width);
  return align === "right" ? value.padStart(width) : value.padEnd(width);
}

export function twoColumn(left: string | number | undefined | null, right: string | number | undefined | null) {
  return `${column(left, LEFT_HEADER_WIDTH)} ${column(right, RIGHT_HEADER_WIDTH)}`;
}

function line(char = "-") {
  return char.repeat(DOT_MATRIX_WIDTH);
}

function center(text: string) {
  const clean = truncate(text.trim());
  const left = Math.floor((DOT_MATRIX_WIDTH - clean.length) / 2);
  return `${" ".repeat(Math.max(0, left))}${clean}`.padEnd(DOT_MATRIX_WIDTH);
}

function pair(label: string, value?: string | number) {
  const left = `${label}:`;
  const right = value === undefined || value === null || value === "" ? "-" : String(value);
  return truncate(`${left.padEnd(18)} ${right}`);
}

function money(value?: number) {
  const amount = Math.round(value || 0);
  if (Math.abs(amount) >= 1_000_000) return `Rp ${Math.round(amount / 1_000).toLocaleString("id-ID")} jt`;
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

export function summaryLine(label: string, value: string | number) {
  const left = column(label.endsWith(":") ? label : `${label}:`, 10);
  return truncate(`${left}${column(value, DOT_MATRIX_WIDTH - 10, "right")}`);
}

function amountLine(label: string, value: number) {
  return summaryLine(label, money(value));
}

function statusLine(label: string, value?: string) {
  return summaryLine(label, value || "-");
}

export function signatureBlock(name?: string) {
  const signer = column(name || "Admin", SIGNATURE_WIDTH, "right");
  const underline = "_".repeat(SIGNATURE_WIDTH);
  return [
    "Tanda Tangan:",
    "",
    column(signer, DOT_MATRIX_WIDTH, "right"),
    "",
    column(underline, DOT_MATRIX_WIDTH, "right")
  ];
}

function layoutHeader(left: string[], right: string[]) {
  const rows: string[] = [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) rows.push(twoColumn(left[index] || "", right[index] || ""));
  return rows;
}

function splitProductRef(productRef: string) {
  const [first, ...rest] = productRef.split(/\s+/);
  return { code: first || productRef, name: rest.join(" ") || productRef };
}

function itemLines(index: number, productRef: string, quantity: number, unitPrice: number, discount = 0) {
  const total = quantity * unitPrice - discount;
  const { code, name } = splitProductRef(productRef);
  const firstLine = [
    column(index + 1, 3),
    column(code, 8),
    column(name, 15),
    column(quantity, 6, "right")
  ].join("");
  const secondLine = [
    column("", 3),
    column("HARGA", 8),
    column("", 5),
    column(money(unitPrice), 10, "right"),
    column(money(total), 18, "right")
  ].join("");
  return [firstLine, secondLine];
}

function infoHeader(brand: string, title: string, dateLabel: string, idLabel: string, right: string[]) {
  return layoutHeader([
    brand,
    title,
    dateLabel,
    idLabel
  ], right);
}

function normalizeLines(lines: string[]) {
  return `${lines.map((entry) => truncate(entry).padEnd(DOT_MATRIX_WIDTH)).join("\n")}\n`;
}

function headerForTipe(tipeCode?: string) {
  return tipeCode?.trim().toUpperCase() === "AJ" ? "ANEKA JAYA" : "SLM";
}

export function formatSaleDotMatrix(sale: Sale, options: { showTransactionNumber?: boolean } = {}) {
  const brand = headerForTipe(sale.tipeCodeSnapshot);
  const transactionNumber = options.showTransactionNumber === false ? "-" : sale.id;
  const rows: string[] = [
    ...infoHeader(brand, "INVOICE PENJUALAN", `Tgl ${sale.saleDate}`, `No ${transactionNumber}`, [
      sale.customerName,
      sale.customerLocation || "-",
      `Bayar ${sale.paymentMethod}`,
      sale.paymentMethod === "Tempo" ? `Tempo ${sale.dueDate || "-"}` : `Kirim ${sale.shippingMethod || "-"}`
    ]),
    line("="),
    `${column("NO", 3)}${column("KODE", 8)}${column("NAMA PRODUK", 15)}${column("QTY", 6, "right")}`,
    `${column("", 3)}${column("", 8)}${column("", 5)}${column("HARGA", 10, "right")}${column("TOTAL", 18, "right")}`,
    line("-"),
    ...sale.items.flatMap((item, index) => itemLines(index, item.productRef, item.quantity, item.unitPrice, item.discount || 0)),
    line("-"),
    amountLine("TOTAL", sale.total),
    statusLine("STATUS", sale.approvalStatus || "approved"),
    line("="),
    ...signatureBlock(sale.createdByNameSnapshot)
  ].filter(Boolean);

  return normalizeLines(rows);
}

export function formatTempoPaymentDotMatrix({ receivable, payments }: TempoPrintInput) {
  const latestPayment = payments[0];
  const brand = headerForTipe(receivable.tipeCodeSnapshot);
  const rows: string[] = [
    ...infoHeader(brand, "BAYAR TEMPO", `Tgl ${latestPayment?.paymentDate || receivable.transactionDate}`, `No ${receivable.id}`, [
      receivable.customerName,
      `Sales ${receivable.salesId}`,
      `Tempo ${receivable.dueDate}`,
      `Status ${receivable.status}`
    ]),
    line("="),
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

  rows.push(line("="), ...signatureBlock(latestPayment?.createdByNameSnapshot || receivable.createdByNameSnapshot));
  return normalizeLines(rows);
}

export function formatExpenseDotMatrix(expense: Expense) {
  const brand = headerForTipe(expense.tipeCodeSnapshot);
  const rows: string[] = [
    ...infoHeader(brand, "PENGELUARAN", `Tgl ${expense.expenseDate}`, `No ${expense.id}`, [
      expense.vendorName,
      expense.rekeningNameSnapshot || expense.rekeningId || "-",
      expense.category,
      expense.coaNameSnapshot || expense.coaId || "-"
    ]),
    line("="),
    pair("Metode", expense.paymentMethod),
    pair("ERP Sync", expense.erpSyncStatus || "not_required"),
    line("-"),
    truncate(`Deskripsi: ${expense.description || "-"}`),
    expense.notes ? truncate(`Catatan  : ${expense.notes}`) : "",
    line("-"),
    amountLine("TOTAL", expense.amount),
    statusLine("STATUS", expense.approvalStatus || "approved"),
    line("="),
    ...signatureBlock(expense.createdByNameSnapshot)
  ].filter(Boolean);

  return normalizeLines(rows);
}

export function toEscPosPrn(text: string) {
  const resetPrinter = "\x1B@";
  const condensedOff = "\x12";
  const formFeed = "\x0C";
  return `${resetPrinter}${condensedOff}${text}${formFeed}`;
}
