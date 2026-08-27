import type { Sale } from "@/lib/types/sales";
import type { Expense } from "@/lib/types/expenses";
import type { TempoPayment, TempoReceivable } from "@/lib/tempo/store";
import { formatJakartaDateTimeCompact } from "@/lib/date/jakarta";

export const DOT_MATRIX_WIDTH = 44;
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

// function itemLines(
//   index: number,
//   productRef: string,
//   quantity: number,
//   unitPrice: number,
//   discount = 0,
//   unit?: string,
// ) {
//   const total = quantity * unitPrice - discount;
//   const code = getProductCode(productRef);

//   const quantityWithUnit = [quantity, unit]
//     .filter((value) => value !== undefined && value !== null && value !== "")
//     .join(" ");

//   const firstLine = [
//     column(index + 1, 3),
//     column(code, 15),
//     column(quantityWithUnit, 12, "right"),
//   ].join("");

//   const secondLine = [
//     column("", 3),
//     column(money(unitPrice), 17, "right"),
//     column(money(total), 24, "right"),
//   ].join("");

//   return [firstLine, secondLine];
// }

export type DotMatrixItemLayout = "single" | "double";
export type UnitFormat = "short" | "full";

const UNIT_ABBREVIATIONS: Record<string, string> = {
  lusin: "Lsn",
  lsn: "Lsn",
  ls: "Lsn",
  gross: "Grs",
  grs: "Grs",
  meter: "Mtr",
  mtr: "Mtr",
  m: "M",
  kotak: "Ktk",
  ktk: "Ktk",
  box: "Box",
  botol: "Btl",
  btl: "Btl",
  lembar: "Lbr",
  lbr: "Lbr",
  pasang: "Psg",
  psg: "Psg",
  bungkus: "Bks",
  bks: "Bks",
  pack: "Pak",
  pak: "Pak",
  pk: "Pak",
  roll: "Roll",
  rol: "Roll",
  rl: "Roll",
  gulung: "Glg",
  pcs: "Pcs",
  pc: "Pcs",
  buah: "Bh",
  bh: "Bh",
  unit: "Unit",
  set: "Set",
  keping: "Kpg",
  kpg: "Kpg",
  karton: "Krt",
  dus: "Dus",
  rim: "Rim",
  karung: "Krg",
  bal: "Bal",
};

export function formatUnit(
  unit?: string | null,
  format: UnitFormat = "short",
): string {
  if (!unit) return "";
  const trimmed = unit.trim();
  if (!trimmed) return "";

  if (format === "full") {
    return trimmed;
  }

  // Jika sudah 3-4 huruf dan all uppercase (seperti PCS, DUS, PAK, ROL), pertahankan
  if (trimmed === trimmed.toUpperCase() && trimmed.length <= 4) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  if (UNIT_ABBREVIATIONS[lower]) {
    return UNIT_ABBREVIATIONS[lower];
  }

  for (const [key, abbr] of Object.entries(UNIT_ABBREVIATIONS)) {
    if (lower.startsWith(key)) {
      return abbr;
    }
  }

  return trimmed.length > 5 ? trimmed.slice(0, 4) : trimmed;
}

function itemLineSingle(
  index: number,
  productRef: string,
  quantity: number,
  unitPrice: number,
  discount = 0,
  unit?: string,
  unitFormat: UnitFormat = "short",
) {
  const total = quantity * unitPrice - discount;
  const code = getProductCode(productRef);
  const formattedUnit = formatUnit(unit, unitFormat);
  const quantityWithUnit = [quantity, formattedUnit]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join(" ");

  // Kolom: NO(3) + KODE/BARANG(14) + QTY(7) + HARGA(10) + TOTAL(10) = 44 karakter
  return [
    column(index + 1, 3),
    column(code, 14),
    column(quantityWithUnit, 7, "right"),
    column(Math.round(unitPrice).toLocaleString("id-ID"), 10, "right"),
    column(Math.round(total).toLocaleString("id-ID"), 10, "right"),
  ].join("");
}

function itemLines(
  index: number,
  productRef: string,
  quantity: number,
  unitPrice: number,
  discount = 0,
  unit?: string,
  unitFormat: UnitFormat = "short",
) {
  const total = quantity * unitPrice - discount;
  const code = getProductCode(productRef);
  const formattedUnit = formatUnit(unit, unitFormat);
  const quantityWithUnit = [quantity, formattedUnit]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join(" ");
  // Baris 1: NO (3) + KODE/NAMA (26) + QTY (15)
  const firstLine = [
    column(index + 1, 3),
    column(code, 26),
    column(quantityWithUnit, 15, "right"),
  ].join("");
  // Baris 2: Spasi (3) + HARGA (19) + TOTAL (22)
  const secondLine = [
    column("", 3),
    column(money(unitPrice), 19, "right"),
    column(money(total), 22, "right"),
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

function paginateSaleItemsSingle<T>(
  items: T[],
  maxSingle = 14,
  maxMulti = 18,
): T[][] {
  const total = items.length;

  // 1 lembar utuh bersama Total & Tanda Tangan
  if (total <= maxSingle) {
    return [items];
  }

  // Jika selisih 1-2 item di atas maxSingle, bagi seimbang agar lembar terakhir ada barangnya
  if (total === maxSingle + 1 || total === maxSingle + 2) {
    const half = Math.ceil(total / 2);
    return [items.slice(0, half), items.slice(half)];
  }

  const pages: T[][] = [];
  let remaining = [...items];

  while (remaining.length > 0) {
    // Lembar terakhir (muat bersama Total & Tanda Tangan)
    if (remaining.length <= maxSingle) {
      pages.push(remaining);
      break;
    }

    if (
      remaining.length === maxSingle + 1 ||
      remaining.length === maxSingle + 2
    ) {
      const half = Math.ceil(remaining.length / 2);
      pages.push(remaining.slice(0, half));
      remaining = remaining.slice(half);
      continue;
    }

    // Lembar antara tanpa Total & TTD (muat padat)
    pages.push(remaining.slice(0, maxMulti));
    remaining = remaining.slice(maxMulti);
  }

  return pages;
}

function paginateSaleItems<T>(items: T[]): T[][] {
  const total = items.length;

  // Kasus 1: 1 sampai 6 item (Muat 1 halaman utuh bersama Tanda Tangan)
  if (total <= 6) {
    return [items];
  }

  // Kasus 2: 7, 8, atau 9 item (Bagi 2 halaman seimbang agar halaman 2 ada barangnya)
  if (total === 7) {
    return [items.slice(0, 6), items.slice(6)];
  }
  if (total === 8) {
    return [items.slice(0, 7), items.slice(7)];
  }
  if (total === 9) {
    return [items.slice(0, 8), items.slice(8)];
  }

  // Kasus 3: 10 item ke atas (Multi Halaman)
  const pages: T[][] = [];
  let remaining = [...items];

  while (remaining.length > 0) {
    if (remaining.length <= 6) {
      pages.push(remaining);
      break;
    }

    if (remaining.length === 7) {
      pages.push(remaining.slice(0, 6));
      remaining = remaining.slice(6);
      continue;
    }

    if (remaining.length === 8) {
      pages.push(remaining.slice(0, 7));
      remaining = remaining.slice(7);
      continue;
    }

    if (remaining.length === 9) {
      pages.push(remaining.slice(0, 8));
      remaining = remaining.slice(8);
      continue;
    }

    pages.push(remaining.slice(0, 9));
    remaining = remaining.slice(9);
  }

  return pages;
}

export function formatSaleDotMatrix(
  sale: Sale,
  options: {
    showTransactionNumber?: boolean;
    itemLayout?: DotMatrixItemLayout;
    maxItemsSinglePage?: number;
    maxItemsMultiPage?: number;
    unitFormat?: UnitFormat;
  } = {},
) {
  const itemLayout = options.itemLayout || "double";
  const unitFormat = options.unitFormat || "short";
  const maxSingle =
    options.maxItemsSinglePage && options.maxItemsSinglePage > 0
      ? options.maxItemsSinglePage
      : 14;
  const maxMulti =
    options.maxItemsMultiPage && options.maxItemsMultiPage > 0
      ? options.maxItemsMultiPage
      : 18;

  const pages =
    itemLayout === "single"
      ? paginateSaleItemsSingle(sale.items, maxSingle, maxMulti)
      : paginateSaleItems(sale.items);

  const pageContents = pages.map((pageItems, pageIndex) => {
    const isLastPage = pageIndex === pages.length - 1;

    const tableHeaders =
      itemLayout === "single"
        ? [
            `${column("NO", 3)}${column("KODE/BARANG", 14)}${column("QTY", 7, "right")}${column("HARGA", 10, "right")}${column("TOTAL", 10, "right")}`,
          ]
        : [
            `${column("NO", 3)}${column("KODE / NAMA BARANG", 26)}${column("QTY", 15, "right")}`,
            `${column("", 3)}${column(
              "HARGA",
              19,
              "right",
            )}${column("TOTAL", 22, "right")}`,
          ];

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

      ...tableHeaders,

      line("-"),

      ...pageItems.flatMap((item, localIndex) => {
        const previousCount = pages
          .slice(0, pageIndex)
          .reduce((sum, p) => sum + p.length, 0);
        const actualIndex = previousCount + localIndex;

        if (itemLayout === "single") {
          return [
            itemLineSingle(
              actualIndex,
              item.productRef,
              item.quantity,
              item.unitPrice,
              item.discount || 0,
              item.unitSnapshot,
              unitFormat,
            ),
          ];
        }

        return itemLines(
          actualIndex,
          item.productRef,
          item.quantity,
          item.unitPrice,
          item.discount || 0,
          item.unitSnapshot,
          unitFormat,
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

    // rows.push(
    //   "",
    //   column(`${pageIndex + 1}/${pages.length}`, DOT_MATRIX_WIDTH, "right"),
    //   "",
    // );

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
