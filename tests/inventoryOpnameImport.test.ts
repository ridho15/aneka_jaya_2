import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
import { parseOpnameWorkbook } from "@/lib/inventory/opnameImport";

async function template(rows: unknown[][], extraHeader?: string) {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Petunjuk").addRow(["catatan"]);
  const ws = wb.addWorksheet("Opname");
  ws.addRow(["STOCK OPNAME — ANEKA JAYA"]);
  ws.addRow([]);
  ws.addRow(["Kode", "Nama Produk", "Kategori", "Satuan", "Modal per Satuan (Rp)", "Isi / Koli", "Koli Gudang", "Lepas Gudang", "Qty Gudang", "Koli Toko", "Lepas Toko", "Qty Toko", "Total Qty Fisik", "Nilai Modal Fisik (Rp)", "Isi pcs per Satuan", "Modal Lama di Sistem (Rp)", extraHeader ?? null]);
  rows.forEach((r, i) => {
    const n = i + 4;
    const row = ws.addRow(r);
    // kolom Qty berupa rumus seperti di template asli (dengan nilai cache)
    row.getCell(9).value = { formula: `IFERROR(G${n}*F${n},0)+H${n}`, result: (Number(r[6]) || 0) * (Number(r[5]) || 0) + (Number(r[7]) || 0) };
    row.getCell(12).value = { formula: `IFERROR(J${n}*F${n},0)+K${n}`, result: (Number(r[9]) || 0) * (Number(r[5]) || 0) + (Number(r[10]) || 0) };
  });
  ws.addRow([null, "TOTAL"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("parseOpnameWorkbook", () => {
  it("membaca template: qty = koli × isi + lepas, harga jual dari kolom tanpa judul", async () => {
    const buf = await template([
      ["KP-1", "Kuku Palsu 1", "Kuku Palsu", "Lusin", 55550, 60, 10, 0, null, 0, 98, null, null, null, 12, 53580, 72000],
      ["BH-1", "Tali BH", "Tali BH", null, 0, null, 0, 0, null, 0, 0, null, null, null, null, null, 15000],
      ["BH-1", "Duplikat", "Tali BH", null, 0, null, 0, 5, null, 0, 0]
    ]);
    const parsed = await parseOpnameWorkbook(buf);
    expect(parsed.sheetName).toBe("Opname");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ sku: "KP-1", unit: "Lusin", costPrice: 55550, sellingPrice: 72000, qtyWarehouse: 600, qtyStore: 98, unitsPerKoli: 60 });
    expect(parsed.rows[1]).toMatchObject({ sku: "BH-1", qtyWarehouse: 0, qtyStore: 0 });
    expect(parsed.warnings.some((w) => w.includes("BH-1") && w.includes("dua kali"))).toBe(true);
  });

  it("memakai kolom berjudul Harga Jual bila ada, dan memperingatkan koli tanpa isi/koli", async () => {
    const parsed = await parseOpnameWorkbook(await template([["X-1", "Barang", null, "Pcs", 100, null, 3, 4, null, 0, 0, null, null, null, null, null, 999]], "Harga Jual"));
    expect(parsed.rows[0]).toMatchObject({ sellingPrice: 999, qtyWarehouse: 4 });
    expect(parsed.warnings.some((w) => w.includes("Isi per koli kosong"))).toBe(true);
  });

  it("menolak file tanpa header Kode/Qty", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("A").addRow(["foo", "bar"]);
    await expect(parseOpnameWorkbook(Buffer.from(await wb.xlsx.writeBuffer()))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("angka teks: 2.500 = 2,5; 1.250.000 dan 1.250,5 format Indonesia", async () => {
    const parsed = await parseOpnameWorkbook(await template([
      ["T-1", "A", null, "Lusin", "1.250.000", null, 0, "2.500", null, 0, "1.250,5", null]
    ]));
    expect(parsed.rows[0]).toMatchObject({ costPrice: 1250000, qtyWarehouse: 2.5, qtyStore: 1250.5 });
  });

  it("nama kosong / sama dengan kode ditandai supaya tidak menimpa nama di master", async () => {
    const parsed = await parseOpnameWorkbook(await template([["N-1", null, null, null, 0, null, 0, 1], ["N-2", "N-2", null, null, 0, null, 0, 1], ["N-3", "Kaos Polos", null, null, 0, null, 0, 1]]));
    expect(parsed.rows.map((r) => r.hasNameInFile)).toEqual([false, false, true]);
  });
});
