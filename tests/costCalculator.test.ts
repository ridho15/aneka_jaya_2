import { describe, expect, it } from "vitest";
import { calculateCost } from "@/lib/inventory/costCalculator";

describe("kalkulator modal barang", () => {
  it("contoh pemilik: 1 koli = 0,5 CBM muat 60 lusin", () => {
    const r = calculateCost({ priceRmbPerPcs: 1.5, pcsPerUnit: 12, unitsPerKoli: 60, cbmPerKoli: 0.5, rmbRate: 2800, cbmRate: 3_500_000, sellingPricePerUnit: 80_000 })!;
    expect(r.freightPerKoli).toBe(1_750_000);       // 3.500.000 × 0,5
    expect(r.freightPerUnit).toBeCloseTo(29_166.67); // ÷ 60 lusin
    expect(r.freightPerPcs).toBeCloseTo(2_430.56);   // ÷ 12 pcs
    expect(r.goodsPerUnit).toBe(50_400);             // 1,5 × 12 × 2.800
    expect(r.costPerUnit).toBeCloseTo(79_566.67);
    expect(r.costPerPcs).toBeCloseTo(6_630.56);
    expect(r.markupPercent).toBe(0.5);
  });
  it("pack isi 20", () => {
    const r = calculateCost({ priceRmbPerPcs: 1, pcsPerUnit: 20, unitsPerKoli: 40, cbmPerKoli: 0.2, rmbRate: 2800, cbmRate: 4_000_000 })!;
    expect(r.freightPerUnit).toBe(20_000);
    expect(r.freightPerPcs).toBe(1_000);
    expect(r.costPerUnit).toBe(76_000);
  });
});
