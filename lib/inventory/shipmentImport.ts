import "server-only";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/prisma";
import { generateGeminiJson } from "@/lib/ai/gemini";
import { InventoryError } from "./errors";
import { hasRealName } from "./math";
import { getCbmRate, getRmbRate } from "./pricing";
import { createStockIn, type InventoryActor } from "./service";
import { computeShipment, shipmentUnitCost, type MasterHint, type ShipmentLine, type ShipmentOverride } from "./shipmentCore";

export type ParsedShipment = { fileHash: string; title: string; reference: string; lines: ShipmentLine[] };

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v && typeof v === "object") {
    const o = v as { result?: unknown; richText?: Array<{ text: string }>; text?: string };
    if (o.result !== undefined) return o.result;
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text !== undefined) return o.text;
  }
  return v;
}
const text = (v: unknown) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
const numberOrNull = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "."));
  return Number.isFinite(n) ? n : null;
};

/** Baca packing list supplier. Kolom dicari dari judul header (ITEM NO, PRODUCT NAME, CTNS, QTY/CTN, UNIT, UNIT PRICE, CBM/CTN). */
export async function parseShipmentWorkbook(buffer: ArrayBuffer): Promise<ParsedShipment> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new InventoryError("VALIDATION", "File Excel tidak punya sheet.");

  let headerRow = 0;
  const col: Record<string, number> = {};
  for (let r = 1; r <= Math.min(30, sheet.rowCount) && !headerRow; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= Math.min(row.cellCount, 60); c++) cells[c] = text(cellValue(row.getCell(c))).toUpperCase();
    if (!cells.some((c) => c?.includes("ITEM NO"))) continue;
    headerRow = r;
    cells.forEach((c, i) => {
      if (!c) return;
      if (c.includes("ITEM NO")) col.sku = i;
      else if (/PR[UO]+DUCT NAME/.test(c)) col.name = i;
      else if (c.includes("QTY/CTN")) col.qtyPerCarton = i;
      else if (c.includes("CTNS")) col.cartons = i;
      else if (c.includes("UNIT PRICE")) col.unitPrice = i;
      else if (/\bUNIT\b/.test(c) && col.unit === undefined) col.unit = i;
      else if (c.includes("CBM/CTN")) col.cbm = i;
    });
  }
  if (!headerRow || col.sku === undefined || col.qtyPerCarton === undefined) {
    throw new InventoryError("VALIDATION", "Header packing list tidak ditemukan (butuh kolom ITEM NO dan QTY/CTN).");
  }

  const title = text(cellValue(sheet.getRow(1).getCell(1)));
  const reference = (title.match(/[A-Z]{4}\d{7}/)?.[0] || title.replace(/[^\w-]+/g, "").slice(0, 40) || "PACKING-LIST").slice(0, 60);
  const lines: ShipmentLine[] = [];
  let currentSku = "";
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const get = (key: string) => (col[key] === undefined ? null : cellValue(row.getCell(col[key])));
    const sku = text(get("sku"));
    if (sku) currentSku = sku;
    const qtyPerCarton = numberOrNull(get("qtyPerCarton"));
    if (!currentSku || !qtyPerCarton || qtyPerCarton <= 0) continue;
    lines.push({
      rowNumber: r,
      sku: currentSku,
      nameOriginal: text(get("name")),
      categoryOriginal: col.name === undefined ? "" : text(cellValue(row.getCell(col.name + 1))),
      cartons: numberOrNull(get("cartons")),
      qtyPerCarton,
      unitInFile: text(get("unit")),
      unitPrice: numberOrNull(get("unitPrice")),
      cbmPerCarton: numberOrNull(get("cbm"))
    });
  }
  if (!lines.length) throw new InventoryError("VALIDATION", "Tidak ada baris barang yang terbaca dari file.");
  const fileHash = createHash("sha256").update(Buffer.from(buffer)).digest("hex").slice(0, 16);
  return { fileHash, title, reference, lines };
}

async function masterHints(skus: string[]): Promise<Record<string, MasterHint>> {
  const rows = await prisma.inventoryProduct.findMany({
    where: { sku: { in: skus, mode: "insensitive" } },
    select: { sku: true, name: true, unit: true, unitsPerKoli: true, pcsPerUnit: true, sellingPrice: true }
  });
  return Object.fromEntries(rows.map((r) => [r.sku.toLowerCase(), {
    sku: r.sku, name: r.name, unit: r.unit, unitsPerKoli: r.unitsPerKoli == null ? null : Number(r.unitsPerKoli),
    pcsPerUnit: r.pcsPerUnit, hasRealName: hasRealName(r.name, r.sku), sellingPrice: Number(r.sellingPrice) || 0
  }]));
}

/** Terjemahkan nama Mandarin ke nama Indonesia singkat lewat Gemini bila tersedia; gagal = pakai kamus sederhana. */
async function translateNames(items: Array<{ sku: string; name: string; category: string }>): Promise<Record<string, string>> {
  if (!items.length || !process.env.GEMINI_API_KEY) return {};
  const prompt = [
    "Terjemahkan nama barang dari packing list supplier Tiongkok ke nama barang Indonesia yang singkat dan jelas untuk toko aksesoris.",
    "Aturan: maksimal 6 kata, awali dengan kategori bahasa Indonesia (mis. Kuku Palsu, Bulu Mata Palsu, Jepit Rambut), pertahankan kode model/angka (mis. X-6203, 12pcs), jangan ada huruf Mandarin.",
    'Balas JSON array [{"sku": string, "name": string}] untuk setiap item.',
    JSON.stringify(items)
  ].join("\n");
  const result = await generateGeminiJson<Array<{ sku: string; name: string }>>(prompt, { timeoutMs: 20000 }).catch(() => ({ success: false as const }));
  if (!result.success || !Array.isArray(result.data)) return {};
  return Object.fromEntries(result.data.filter((r) => r?.sku && r?.name && !/[㐀-鿿]/.test(r.name)).map((r) => [r.sku, String(r.name).slice(0, 120)]));
}

/** Pratinjau: baris file, petunjuk Master Barang, terjemahan nama, dan kurs saat ini. */
export async function previewShipment(parsed: ParsedShipment) {
  const skus = Array.from(new Set(parsed.lines.map((l) => l.sku)));
  const [master, rmb, cbm] = await Promise.all([masterHints(skus), getRmbRate(), getCbmRate()]);
  const needName = skus.filter((sku) => !master[sku.toLowerCase()]?.hasRealName).map((sku) => {
    const line = parsed.lines.find((l) => l.sku === sku)!;
    return { sku, name: line.nameOriginal, category: line.categoryOriginal };
  });
  const translatedNames = await translateNames(needName);
  return { ...parsed, master, translatedNames, rmbRate: rmb.rate, cbmRate: cbm.rate };
}

export type SaveShipmentOptions = {
  overrides: Record<string, ShipmentOverride>;
  addStock: boolean;
  locationId?: string;
  movementDate?: string;
};

/** Simpan ke Master Barang (buat/perbarui) dan, bila diminta, catat stok sebagai Barang Masuk. Aman diulang. */
export async function saveShipment(parsed: ParsedShipment, options: SaveShipmentOptions, actor?: InventoryActor) {
  if (options.addStock && !options.locationId) throw new InventoryError("VALIDATION", "Pilih lokasi tujuan stok.");
  const skus = Array.from(new Set(parsed.lines.map((l) => l.sku)));
  const [master, rmb, cbm] = await Promise.all([masterHints(skus), getRmbRate(), getCbmRate()]);
  const products = computeShipment(parsed.lines, { master, overrides: options.overrides });

  let created = 0;
  let updated = 0;
  const ids = new Map<string, { id: string; cost: number }>();
  for (const p of products) {
    const existing = await prisma.inventoryProduct.findFirst({ where: { sku: { equals: p.sku, mode: "insensitive" } } });
    const cbmRate = existing?.cbmRateIdr != null ? Number(existing.cbmRateIdr) : cbm.rate;
    const unitCost = shipmentUnitCost(p, rmb.rate, cbmRate);
    const extra = existing ? Number(existing.extraCostIdr) : 0;
    const costPrice = unitCost == null ? undefined : Math.round((unitCost + extra) * 100) / 100;
    const shared = {
      pcsPerUnit: p.pcsPerUnit,
      ...(p.priceRmb != null ? { priceRmb: p.priceRmb } : {}),
      ...(p.cbmPerUnit != null ? { cbmPerUnit: p.cbmPerUnit } : {}),
      ...(costPrice != null ? { costPrice } : {})
    };
    if (existing) {
      const row = await prisma.inventoryProduct.update({
        where: { id: existing.id },
        data: {
          ...shared,
          ...(!hasRealName(existing.name, existing.sku) && p.name ? { name: p.name } : {}),
          ...(!existing.category && p.category ? { category: p.category } : {}),
          ...(existing.unitsPerKoli == null && p.unitsPerKoli != null ? { unitsPerKoli: p.unitsPerKoli } : {})
        }
      });
      updated += 1;
      ids.set(p.sku, { id: row.id, cost: Number(row.costPrice) });
    } else {
      const row = await prisma.inventoryProduct.create({
        data: { sku: p.sku, name: p.name || p.sku, category: p.category || null, unit: p.unit, unitsPerKoli: p.unitsPerKoli, sellingPrice: 0, ...shared }
      });
      created += 1;
      ids.set(p.sku, { id: row.id, cost: Number(row.costPrice) });
    }
  }

  let stockIn: { referenceNumber: string; items: number } | null = null;
  if (options.addStock) {
    const items = products.filter((p) => p.quantity > 0).map((p) => ({ productId: ids.get(p.sku)!.id, quantity: p.quantity, unitCost: ids.get(p.sku)!.cost || undefined }));
    await createStockIn({
      locationId: options.locationId!,
      movementDate: options.movementDate,
      referenceNumber: parsed.reference,
      notes: `Import packing list ${parsed.title}`.slice(0, 1000),
      idempotencyKey: `shipment:${parsed.fileHash}`,
      items
    }, actor);
    stockIn = { referenceNumber: parsed.reference, items: items.length };
  }
  return { products: products.length, created, updated, stockIn, rmbRate: rmb.rate, cbmRate: cbm.rate };
}
