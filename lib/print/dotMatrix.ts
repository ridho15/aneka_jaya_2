import type { Sale } from "@/lib/types/sales";
import type { Expense } from "@/lib/types/expenses";
import type { TempoPayment, TempoReceivable } from "@/lib/tempo/store";
import { formatJakartaDateTimeCompact } from "@/lib/date/jakarta";

export const DOT_MATRIX_WIDTH = 30;
const LEFT_HEADER_WIDTH = 21;
const RIGHT_HEADER_WIDTH = DOT_MATRIX_WIDTH - LEFT_HEADER_WIDTH - 1;
const SIGNATURE_WIDTH = 24;
const PAGE_LINES = 44;

type TempoPrintInput = {
  receivable: TempoReceivable;
  payments: TempoPayment[];
};

export function truncate(
  text: string | number | undefined | null,
  width = DOT_MATRIX_WIDTH,
) {
  const value = text === undefined || text === null ? "-" : String(text);

  return value.length > width ? value.slice(0, width) : value;
}

export function column(
  text: string | number | undefined | null,
  width: number,
  align: "left" | "right" = "left",
) {
  const value = truncate(text, width);
  return align === "right" ? value.padStart(width) : value.padEnd(width);
}

export function twoColumn(
  left: string | number | undefined | null,
  right: string | number | undefined | null,
) {
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
  const right =
    value === undefined || value === null || value === "" ? "-" : String(value);
  return truncate(`${left.padEnd(18)} ${right}`);
}

function money(value?: number) {
  const amount = Math.round(value || 0);
  if (Math.abs(amount) >= 1_000_000)
    return `Rp ${Math.round(amount / 1_000).toLocaleString("id-ID")} jt`;
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
    column(underline, DOT_MATRIX_WIDTH, "right"),
  ];
}

function layoutHeader(left: string[], right: string[]) {
  const rows: string[] = [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1)
    rows.push(twoColumn(left[index] || "", right[index] || ""));
  return rows;
}

function getProductCode(productRef: string) {
  return productRef.split(/\s+/)[0] || productRef;
}

function itemLines(
  index: number,
  productRef: string,
  quantity: number,
  unitPrice: number,
  discount = 0,
  unit?: string,
) {
  const total = quantity * unitPrice - discount;
  const code = getProductCode(productRef);

  const quantityWithUnit = [quantity, unit]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join(" ");

  const firstLine = [
    column(index + 1, 3),
    column(code, 15),
    column(quantityWithUnit, 12, "right"),
  ].join("");

  const secondLine = [
    column("", 3),
    column(money(unitPrice), 17, "right"),
    column(money(total), 24, "right"),
  ].join("");

  return [firstLine, secondLine];
}

function infoHeader(
  title: string,
  dateLabel: string,
  idLabel: string,
  right: string[],
) {
  return layoutHeader([title, dateLabel, idLabel], right);
}

function normalizeLines(lines: string[]) {
  return `${lines.map((entry) => truncate(entry).padEnd(DOT_MATRIX_WIDTH)).join("\n")}\n`;
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

export function formatSaleDotMatrix(
  sale: Sale,
  options: { showTransactionNumber?: boolean } = {},
) {
  const transactionNumber =
    options.showTransactionNumber === false
      ? "-"
      : sale.transactionNumber || sale.id;

  const ITEM_PER_PAGE = 9;

  const pages = chunkItems(sale.items, ITEM_PER_PAGE);

  const pageContents = pages.map((pageItems, pageIndex) => {
    const isLastPage = pageIndex === pages.length - 1;

    const rows: string[] = [
      ...infoHeader(
        "INVOICE PENJUALAN",
        `${
          sale.transactionAt
            ? formatJakartaDateTimeCompact(sale.transactionAt)
            : sale.saleDate
        }`,
        "",
        [
          sale.customerName,
          sale.customerLocation || "-",
          `Bayar ${sale.paymentMethod}`,
          sale.paymentMethod === "Tempo"
            ? `Tempo ${sale.dueDate || "-"}`
            : `Kirim ${sale.shippingMethod || "-"}`,
        ],
      ),

      line("="),

      `${column("NO", 3)}${column("KODE", 15)}${column("QTY", 12, "right")}`,

      `${column("", 3)}${column(
        "HARGA",
        17,
        "right",
      )}${column("TOTAL", 24, "right")}`,

      line("-"),

      ...pageItems.flatMap((item, localIndex) => {
        const actualIndex = pageIndex * ITEM_PER_PAGE + localIndex;

        return itemLines(
          actualIndex,
          item.productRef,
          item.quantity,
          item.unitPrice,
          item.discount || 0,
          item.unitSnapshot,
        );
      }),

      line("-"),
    ];

    if (isLastPage) {
      rows.push(
        amountLine("TOTAL", sale.total),

        ...(sale.paymentMethod === "Tempo"
          ? [
              amountLine("DP", sale.initialPaymentAmount || 0),
              amountLine(
                "SISA TEMPO",
                Math.max(0, sale.total - (sale.initialPaymentAmount || 0)),
              ),
            ]
          : []),

        line("="),

        ...signatureBlock(sale.createdByNameSnapshot),
      );
    }

    // /* Isi baris kosong sampai bagian bawah halaman */
    // while (rows.length < PAGE_LINES - 1) {
    //   rows.push("");
    // }

    // /* Nomor halaman saja, tanpa tulisan HALAMAN */
    // rows.push(
    //   column(
    //     `${pageIndex + 1}/${pages.length}`,
    //     DOT_MATRIX_WIDTH,
    //     "right"
    //   )
    // );

    rows.push(
      "",
      column(`${pageIndex + 1}/${pages.length}`, DOT_MATRIX_WIDTH, "right"),
      "",
    );

    return normalizeLines(rows);
  });

  return pageContents.join("\x0C");
}

export function formatTempoPaymentDotMatrix({
  receivable,
  payments,
}: TempoPrintInput) {
  const latestPayment = payments[0];
  const rows: string[] = [
    ...infoHeader(
      "BAYAR TEMPO",
      `${latestPayment?.paymentDate || receivable.transactionDate}`,
      `No ${receivable.id}`,
      [
        receivable.customerName,
        `Sales ${receivable.salesId}`,
        `Tempo ${receivable.dueDate}`,
      ],
    ),
    line("="),
    amountLine("TOTAL TEMPO", receivable.originalAmount),
    amountLine("SUDAH DIBAYAR", receivable.paidAmount),
    amountLine("SISA TEMPO", receivable.remainingAmount),
    line("-"),
  ];

  if (latestPayment) {
    rows.push(
      pair("Pembayaran", latestPayment.id),
      pair("Tanggal Bayar", latestPayment.paymentDate),
      pair("Metode", latestPayment.paymentMethod),
      amountLine("NOMINAL BAYAR", latestPayment.amountPaid),
    );
  } else {
    rows.push(center("Belum ada pembayaran tercatat"));
  }

  rows.push(
    line("="),
    ...signatureBlock(
      latestPayment?.createdByNameSnapshot || receivable.createdByNameSnapshot,
    ),
  );
  return normalizeLines(rows);
}

export function formatExpenseDotMatrix(expense: Expense) {
  const rows: string[] = [
    ...infoHeader("PENGELUARAN", `${expense.expenseDate}`, `No ${expense.id}`, [
      expense.vendorName,
      expense.rekeningNameSnapshot || expense.rekeningId || "-",
      expense.category,
      expense.coaNameSnapshot || expense.coaId || "-",
    ]),
    line("="),
    pair("Metode", expense.paymentMethod),
    pair("ERP Sync", expense.erpSyncStatus || "not_required"),
    line("-"),
    truncate(`Deskripsi: ${expense.description || "-"}`),
    expense.notes ? truncate(`Catatan  : ${expense.notes}`) : "",
    line("-"),
    amountLine("TOTAL", expense.amount),
    line("="),
    ...signatureBlock(expense.createdByNameSnapshot),
  ].filter(Boolean);

  return normalizeLines(rows);
}

export function toEscPosPrn(text: string) {
  const resetPrinter = "\x1B@";
  const condensedOff = "\x12";
  return `${resetPrinter}${condensedOff}${text}`;
}
