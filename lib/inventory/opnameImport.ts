import "server-only";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/prisma";
import { InventoryError } from "./errors";
import { hasRealName, round2 } from "./math";
import { DEFAULT_UNIT } from "./config";
import { createOpname, type InventoryActor } from "./service";
import { costFromRmb, getRmbRate } from "./pricing";

/**
 * Import hasil stock opname dari file Excel template "Stock Opname Aneka Jaya".
 *
 * Kolom yang dibaca dari sheet "Opname" (dicari berdasarkan judul header, bukan posisi):
 *   Kode, Nama Produk, Kategori, Satuan, Modal per Satuan (Rp), Isi / Koli,
 *   Koli Gudang, Lepas Gudang, Qty Gudang, Koli Toko, Lepas Toko, Qty Toko, Harga Jual.
 * Qty = Koli × Isi/Koli + Lepas (sama dengan rumus di template).
 */

export type OpnameImportRow = {
  rowNumber: number;
  sku: string;
  name: string;
  /** true bila kolom Nama Produk di file berisi nama asli (bukan kosong / sama dengan kode). */
  hasNameInFile: boolean;
  category?: string;
  unit?: string;
  costPrice?: number;
  sellingPrice?: number;
  unitsPerKoli?: number;
  priceRmb?: number;
  qtyWarehouse: number;
  qtyStore: number;
};

export type ParsedOpnameWorkbook = {
  fileHash: string;
  sheetName: string;
  rows: OpnameImportRow[];
  warnings: string[];
};

const HEADER_ALIASES: Record<string, string[]> = {
  sku: ["kode", "sku", "kode produk", "kode barang"],
  name: ["nama produk", "nama barang", "nama"],
  category: ["kategori"],
  unit: ["satuan", "uom"],
  costPrice: ["modal per satuan (rp)", "modal per satuan", "hpp", "harga modal"],
  perKoli: ["isi / koli", "isi/koli", "isi per koli"],
  koliWarehouse: ["koli gudang"],
  looseWarehouse: ["lepas gudang"],
  qtyWarehouse: ["qty gudang"],
  koliStore: ["koli toko"],
  looseStore: ["lepas toko"],
  qtyStore: ["qty toko"],
  sellingPrice: ["harga jual", "harga jual (rp)"],
  priceRmb: ["harga rmb", "harga rmb (¥)", "harga (rmb)", "rmb"],
  oldCost: ["modal lama di sistem (rp)", "modal lama di sistem"]
};

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v && typeof v === "object") {
    const o = v as { result?: unknown; formula?: unknown; richText?: { text: string }[]; text?: unknown };
    if ("formula" in o || "sharedFormula" in o) return o.result ?? null;
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if ("text" in o) return o.text;
  }
  return v;
}

function isFormula(cell: ExcelJS.Cell) {
  const v = cell.value as unknown;
  return Boolean(v && typeof v === "object" && ("formula" in (v as object) || "sharedFormula" in (v as object)));
}

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  let text = String(v).replace(/rp/i, "").replace(/\s/g, "");
  // Format Indonesia "1.250,5": titik = ribuan, koma = desimal. Tanpa koma, titik ribuan hanya
  // dianggap ada bila polanya jelas (lebih dari satu grup, mis. "1.250.000"); "2.500" tetap 2,5.
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(text)) text = text.replace(/\./g, "");
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

function toText(v: unknown) {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
}

export async function parseOpnameWorkbook(buffer: ArrayBuffer | Buffer): Promise<ParsedOpnameWorkbook> {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const fileHash = createHash("sha256").update(data).digest("hex").slice(0, 16);
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs mengharapkan Buffer Node; tipe bawaannya belum mengenal Buffer generik terbaru.
    await workbook.xlsx.load(data as unknown as ExcelJS.Buffer);
  } catch {
    throw new InventoryError("VALIDATION", "File tidak bisa dibaca. Pastikan formatnya .xlsx.");
  }

  // Cari sheet + baris header yang memuat kolom "Kode" dan "Qty Gudang"/"Qty Toko".
  let found: { sheet: ExcelJS.Worksheet; headerRow: number; cols: Record<string, number> } | undefined;
  const sheets = [...workbook.worksheets].sort((a, b) => (norm(a.name) === "opname" ? -1 : norm(b.name) === "opname" ? 1 : 0));
  for (const sheet of sheets) {
    for (let r = 1; r <= Math.min(sheet.rowCount, 30) && !found; r++) {
      const row = sheet.getRow(r);
      const cols: Record<string, number> = {};
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const text = norm(cellValue(cell));
        for (const [key, aliases] of Object.entries(HEADER_ALIASES)) if (!cols[key] && aliases.includes(text)) cols[key] = col;
      });
      if (cols.sku && (cols.qtyWarehouse || cols.qtyStore || cols.looseWarehouse || cols.looseStore)) found = { sheet, headerRow: r, cols };
    }
    if (found) break;
  }
  if (!found) throw new InventoryError("VALIDATION", "Header tidak ditemukan. Sheet harus punya kolom 'Kode' dan 'Qty Gudang' / 'Qty Toko'.");

  const { sheet, headerRow, cols } = found;
  const warnings: string[] = [];
  // Template Aneka Jaya: kolom Harga Jual tidak berjudul, letaknya tepat setelah "Modal Lama di Sistem".
  if (!cols.sellingPrice && cols.oldCost) {
    cols.sellingPrice = cols.oldCost + 1;
    warnings.push(`Kolom Harga Jual tidak berjudul; memakai kolom ${sheet.getColumn(cols.sellingPrice).letter} (setelah "Modal Lama di Sistem").`);
  }

  const get = (row: ExcelJS.Row, key: string) => (cols[key] ? cellValue(row.getCell(cols[key])) : undefined);
  const qtyFor = (row: ExcelJS.Row, koliKey: string, looseKey: string, qtyKey: string) => {
    const qtyCell = cols[qtyKey] ? row.getCell(cols[qtyKey]) : undefined;
    // Angka yang diketik langsung di kolom Qty dipakai apa adanya; jika rumus, hitung dari Koli × Isi + Lepas.
    if (qtyCell && !isFormula(qtyCell)) {
      const direct = toNumber(cellValue(qtyCell));
      if (direct !== undefined) return direct;
    }
    const perKoli = toNumber(get(row, "perKoli")) ?? 0;
    const computed = (toNumber(get(row, koliKey)) ?? 0) * perKoli + (toNumber(get(row, looseKey)) ?? 0);
    const cached = qtyCell ? toNumber(cellValue(qtyCell)) : undefined;
    if (cached !== undefined && cols[koliKey] === undefined && cols[looseKey] === undefined) return cached;
    if ((toNumber(get(row, koliKey)) ?? 0) > 0 && !perKoli) {
      warnings.push(`Baris ${row.number} (${toText(get(row, "sku"))}): ada Koli tapi Isi per koli kosong, jadi koli tidak dihitung.`);
    }
    return computed;
  };

  const rows: OpnameImportRow[] = [];
  const seen = new Map<string, number>();
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const sku = toText(get(row, "sku"));
    const name = toText(get(row, "name"));
    if (!sku) continue; // baris kosong / TOTAL
    if (seen.has(sku)) {
      warnings.push(`Kode ${sku} muncul dua kali (baris ${seen.get(sku)} dan ${r}); baris ${r} diabaikan.`);
      continue;
    }
    seen.set(sku, r);
    const qtyWarehouse = round2(qtyFor(row, "koliWarehouse", "looseWarehouse", "qtyWarehouse"));
    const qtyStore = round2(qtyFor(row, "koliStore", "looseStore", "qtyStore"));
    if (qtyWarehouse < 0 || qtyStore < 0) {
      warnings.push(`Baris ${r} (${sku}): qty negatif diabaikan.`);
      continue;
    }
    rows.push({
      rowNumber: r,
      sku: sku.slice(0, 80),
      name: (name || sku).slice(0, 255),
      hasNameInFile: Boolean(name && hasRealName(name, sku)),
      category: toText(get(row, "category"))?.slice(0, 120),
      unit: toText(get(row, "unit"))?.slice(0, 20),
      costPrice: toNumber(get(row, "costPrice")),
      sellingPrice: toNumber(get(row, "sellingPrice")),
      unitsPerKoli: (() => { const v = toNumber(get(row, "perKoli")); return v && v > 0 ? v : undefined; })(),
      priceRmb: (() => { const v = toNumber(get(row, "priceRmb")); return v != null && v >= 0 ? v : undefined; })(),
      qtyWarehouse,
      qtyStore
    });
  }
  if (!rows.length) throw new InventoryError("VALIDATION", "Tidak ada baris barang yang bisa dibaca dari file.");
  return { fileHash, sheetName: sheet.name, rows, warnings };
}

export type OpnameImportOptions = {
  warehouseLocationId?: string;
  storeLocationId?: string;
  opnameDate?: string;
  /** true = kode yang qty-nya 0 di file ikut di-opname menjadi 0 (stok lama dihapus). */
  zeroUncounted: boolean;
  /** true = harga modal, harga jual, kategori, satuan, nama di master barang ikut diperbarui. */
  updateMaster: boolean;
  dryRun: boolean;
};

export type OpnameImportSummary = {
  dryRun: boolean;
  fileHash: string;
  sheetName: string;
  totalRows: number;
  newProducts: number;
  existingProducts: number;
  warehouse?: { locationCode: string; items: number; nonZero: number; totalQty: number; documents: string[] };
  store?: { locationCode: string; items: number; nonZero: number; totalQty: number; documents: string[] };
  totalCostValue: number;
  warnings: string[];
  sample: OpnameImportRow[];
};

const CHUNK = 250;

/** Kunci idempoten per batch dari isinya: file & opsi sama → batch sama → tidak diposting dua kali. */
function batchKey(locationId: string, date: string | undefined, lines: string[]) {
  return createHash("sha256").update([locationId, date ?? "", ...lines].join("\n")).digest("hex").slice(0, 40);
}

export async function importOpnameWorkbook(parsed: ParsedOpnameWorkbook, options: OpnameImportOptions, actor?: InventoryActor): Promise<OpnameImportSummary> {
  if (!options.warehouseLocationId && !options.storeLocationId) {
    throw new InventoryError("VALIDATION", "Pilih minimal satu lokasi: gudang dan/atau toko.");
  }
  const findLocation = async (id?: string) => {
    if (!id) return undefined;
    const loc = await prisma.inventoryLocation.findFirst({ where: { OR: [{ id }, { code: id.trim().toUpperCase() }] } });
    if (!loc) throw new InventoryError("NOT_FOUND", `Lokasi ${id} tidak ditemukan.`, 404);
    return loc;
  };
  const [warehouse, store] = await Promise.all([findLocation(options.warehouseLocationId), findLocation(options.storeLocationId)]);
  if (warehouse && store && warehouse.id === store.id) throw new InventoryError("VALIDATION", "Lokasi gudang dan toko tidak boleh sama.");

  const skus = parsed.rows.map((r) => r.sku);
  const existing = new Map((await prisma.inventoryProduct.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } })).map((p) => [p.sku, p.id]));
  const pick = (key: "qtyWarehouse" | "qtyStore") => parsed.rows.filter((r) => options.zeroUncounted || r[key] !== 0);
  const side = (loc: typeof warehouse, key: "qtyWarehouse" | "qtyStore") => loc && {
    locationCode: loc.code,
    items: pick(key).length,
    nonZero: parsed.rows.filter((r) => r[key] !== 0).length,
    totalQty: round2(parsed.rows.reduce((s, r) => s + r[key], 0)),
    documents: [] as string[]
  };
  const summary: OpnameImportSummary = {
    dryRun: options.dryRun,
    fileHash: parsed.fileHash,
    sheetName: parsed.sheetName,
    totalRows: parsed.rows.length,
    newProducts: parsed.rows.filter((r) => !existing.has(r.sku)).length,
    existingProducts: parsed.rows.filter((r) => existing.has(r.sku)).length,
    warehouse: side(warehouse, "qtyWarehouse"),
    store: side(store, "qtyStore"),
    totalCostValue: round2(parsed.rows.reduce((s, r) => s + ((warehouse ? r.qtyWarehouse : 0) + (store ? r.qtyStore : 0)) * (r.costPrice ?? 0), 0)),
    warnings: parsed.warnings,
    sample: parsed.rows.filter((r) => r.qtyWarehouse || r.qtyStore).slice(0, 15)
  };
  if (options.dryRun) return summary;

  // 1) Master barang: buat yang belum ada, perbarui yang sudah ada bila diminta.
  //    Bila ada Harga RMB dan kurs RMB sudah diatur, modal dihitung dari RMB.
  const { rate } = await getRmbRate();
  const costOf = (r: OpnameImportRow) => (r.priceRmb != null && rate ? costFromRmb(r.priceRmb, rate) : r.costPrice);
  const newRows = parsed.rows.filter((r) => !existing.has(r.sku));
  for (let i = 0; i < newRows.length; i += 500) {
    await prisma.inventoryProduct.createMany({
      data: newRows.slice(i, i + 500).map((r) => ({
        sku: r.sku, name: r.name, category: r.category, unit: r.unit || DEFAULT_UNIT,
        costPrice: costOf(r) ?? 0, sellingPrice: r.sellingPrice ?? 0,
        unitsPerKoli: r.unitsPerKoli ?? null, priceRmb: r.priceRmb ?? null
      })),
      skipDuplicates: true
    });
  }
  if (options.updateMaster) {
    for (const r of parsed.rows.filter((x) => existing.has(x.sku))) {
      await prisma.inventoryProduct.update({
        where: { sku: r.sku },
        data: {
          // Nama kosong / sama dengan kode di file tidak menimpa nama barang yang sudah ada.
          ...(r.hasNameInFile ? { name: r.name } : {}),
          ...(r.category ? { category: r.category } : {}),
          ...(r.unit ? { unit: r.unit } : {}),
          // modal/harga 0 atau kosong tidak menimpa data yang sudah ada
          // modal dari RMB dihitung ulang di bawah agar biaya tambahan barang ikut terhitung
          ...(r.priceRmb == null || !rate ? (r.costPrice ? { costPrice: r.costPrice } : {}) : {}),
          ...(r.unitsPerKoli ? { unitsPerKoli: r.unitsPerKoli } : {}),
          ...(r.priceRmb != null ? { priceRmb: r.priceRmb } : {}),
          ...(r.sellingPrice ? { sellingPrice: r.sellingPrice } : {})
        }
      });
    }
  }

  const rmbSkus = parsed.rows.filter((r) => r.priceRmb != null).map((r) => r.sku);
  if (rate && rmbSkus.length) {
    await prisma.$executeRaw`
      UPDATE "InventoryProduct" SET "costPrice" = ROUND("priceRmb" * ${rate}::numeric + "extraCostIdr", 2), "updatedAt" = NOW()
      WHERE "priceRmb" IS NOT NULL AND "sku" = ANY(${rmbSkus})`;
  }

  // 2) Stock opname per lokasi, dipecah per 250 barang. idempotencyKey berbasis hash file
  //    sehingga upload ulang file yang sama tidak membuat opname ganda.
  const date = options.opnameDate;
  const post = async (loc: NonNullable<typeof warehouse>, key: "qtyWarehouse" | "qtyStore", target: { documents: string[] }) => {
    const rows = pick(key);
    for (let i = 0, part = 1; i < rows.length; i += CHUNK, part++) {
      const opname = await createOpname({
        locationId: loc.id,
        opnameDate: date,
        idempotencyKey: `xlsx-opname:${batchKey(loc.id, date, rows.slice(i, i + CHUNK).map((r) => `${r.sku}=${r[key]}`))}`,
        notes: `Import Excel opname (${parsed.sheetName}) bagian ${part}/${Math.ceil(rows.length / CHUNK)}`,
        items: rows.slice(i, i + CHUNK).map((r) => ({ sku: r.sku, countedQty: r[key] }))
      }, actor);
      target.documents.push(opname.opnameNumber);
    }
  };
  if (warehouse && summary.warehouse) await post(warehouse, "qtyWarehouse", summary.warehouse);
  if (store && summary.store) await post(store, "qtyStore", summary.store);
  return summary;
}
