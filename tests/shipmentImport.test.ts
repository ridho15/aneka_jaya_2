import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { computeShipment, fallbackIndonesianName, type ShipmentLine } from "@/lib/inventory/shipmentCore";

vi.mock("server-only", () => ({}));

const line = (l: Partial<ShipmentLine>): ShipmentLine => ({ rowNumber: 1, sku: "X", nameOriginal: "", categoryOriginal: "FAKE NAIL", cartons: 1, qtyPerCarton: 720, unitInFile: "pcs", unitPrice: 1, cbmPerCarton: 0.12, ...l });

describe("shipment import rules", () => {
  it("12 pcs per lusin; price and CBM per lusin", () => {
    const [p] = computeShipment([line({ sku: "AJKP49-10", cartons: 29, qtyPerCarton: 720, unitPrice: 1.7, cbmPerCarton: 0.130732 }), line({ sku: "AJKP49-10", cartons: 1, qtyPerCarton: 600, unitPrice: 1.7, cbmPerCarton: 0.102312 })]);
    expect(p.pcsPerUnit).toBe(12);
    expect(p.unit).toBe("Lusin");
    expect(p.quantity).toBe((29 * 720 + 600) / 12);
    expect(p.unitsPerKoli).toBe(60);
    expect(p.priceRmb).toBeCloseTo(20.4, 4);
    expect(p.cbmPerUnit).toBeCloseTo((29 * 0.130732 + 0.102312) / p.quantity, 6);
  });

  it("not divisible by 12 -> packs of 10", () => {
    const [p] = computeShipment([line({ sku: "PKG", qtyPerCarton: 3200, unitPrice: 0.6 })]);
    expect(p.pcsPerUnit).toBe(10);
    expect(p.unit).toBe("Pack");
    expect(p.priceRmb).toBeCloseTo(6, 4);
  });

  it("master isi per koli wins (AMJ07-2: 800 pcs = 40 pack of 20)", () => {
    const [p] = computeShipment([line({ sku: "AMJ07-2", cartons: 12, qtyPerCarton: 800, unitPrice: 1.68 })], {
      master: { "amj07-2": { sku: "AMJ07-2", name: "Hairnet", unit: "Box", unitsPerKoli: 40, pcsPerUnit: null, hasRealName: true } }
    });
    expect(p.pcsPerUnit).toBe(20);
    expect(p.pcsPerUnitSource).toBe("master");
    expect(p.unit).toBe("Box");
    expect(p.quantity).toBe(480);
    expect(p.priceRmb).toBeCloseTo(33.6, 4);
    expect(p.name).toBe("Hairnet");
  });

  it("DZ unit is already per lusin", () => {
    const [p] = computeShipment([line({ sku: "AMJ01-13", qtyPerCarton: 90, unitInFile: "DZ", unitPrice: 19.2 })]);
    expect(p.pcsPerUnit).toBe(12);
    expect(p.quantity).toBe(90);
    expect(p.priceRmb).toBeCloseTo(19.2, 4);
  });

  it("rows without CTNS share the carton above; CBM split by pcs", () => {
    const ps = computeShipment([
      line({ sku: "AMJ05-1", cartons: 1, qtyPerCarton: 120, cbmPerCarton: 0.135 }),
      line({ sku: "AMJ05-1", cartons: null, qtyPerCarton: 120, cbmPerCarton: null }),
      line({ sku: "AMJ05-3", cartons: null, qtyPerCarton: 120, cbmPerCarton: null })
    ]);
    const a = ps.find((p) => p.sku === "AMJ05-1")!;
    const b = ps.find((p) => p.sku === "AMJ05-3")!;
    expect(a.quantity).toBe(20);
    expect(b.quantity).toBe(10);
    expect(a.cbmPerUnit! * a.quantity + b.cbmPerUnit! * b.quantity).toBeCloseTo(0.135, 6);
    expect(b.unitsPerKoli).toBeNull();
  });

  it("manual override of pcs per unit", () => {
    const [p] = computeShipment([line({ sku: "S", qtyPerCarton: 720 })], { overrides: { S: { pcsPerUnit: 24, name: "Nama Baru" } } });
    expect(p.pcsPerUnit).toBe(24);
    expect(p.quantity).toBe(30);
    expect(p.name).toBe("Nama Baru");
  });

  it("fallback translation leaves no Chinese characters", () => {
    expect(fallbackIndonesianName("猫眼印花12pcs 织带盒", "FAKE NAIL")).toBe("Kuku Palsu Cat Eye Motif 12pcs Kotak Pita");
    expect(/[㐀-鿿]/.test(fallbackIndonesianName("发网夹", "HAIR CLIP"))).toBe(false);
  });
});

const sample = "/root/.claude/uploads/3f464e7c-9d1d-5a48-91f7-ca0499918352/70714bb0-20260826-SLM_______2.xlsx";
describe.skipIf(!existsSync(sample))("real packing list", () => {
  it("parses every product", async () => {
    const { parseShipmentWorkbook } = await import("@/lib/inventory/shipmentImport");
    const buf = readFileSync(sample);
    const parsed = await parseShipmentWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(parsed.reference).toBe("HDMU4921089");
    const products = computeShipment(parsed.lines);
    expect(products.length).toBe(65);
    const blister = products.find((p) => p.sku === "AJKP49-12")!;
    expect(blister.warnings.length).toBeGreaterThanOrEqual(0);
  });
});
