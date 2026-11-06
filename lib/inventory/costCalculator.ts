/**
 * Kalkulator modal barang impor (murni, dipakai di browser):
 * - harga barang per satuan = harga RMB per pcs × isi pcs per satuan × kurs
 * - ongkir per koli = CBM per koli × tarif CBM; per satuan = ÷ isi koli; per pcs = ÷ isi pcs per satuan
 * - modal = harga barang + ongkir
 */
export type CostCalculatorInput = {
  priceRmbPerPcs: number;
  pcsPerUnit: number;
  unitsPerKoli: number;
  cbmPerKoli: number;
  rmbRate: number;
  cbmRate: number;
  sellingPricePerUnit?: number;
};

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function calculateCost(i: CostCalculatorInput) {
  const ok = (n: number) => Number.isFinite(n) && n > 0;
  if (![i.pcsPerUnit, i.unitsPerKoli].every(ok)) return null;
  const goodsPerPcs = (i.priceRmbPerPcs || 0) * (i.rmbRate || 0);
  const goodsPerUnit = goodsPerPcs * i.pcsPerUnit;
  const freightPerKoli = (i.cbmPerKoli || 0) * (i.cbmRate || 0);
  const freightPerUnit = freightPerKoli / i.unitsPerKoli;
  const freightPerPcs = freightPerUnit / i.pcsPerUnit;
  const costPerUnit = goodsPerUnit + freightPerUnit;
  const costPerPcs = goodsPerPcs + freightPerPcs;
  const sell = i.sellingPricePerUnit && i.sellingPricePerUnit > 0 ? i.sellingPricePerUnit : null;
  return {
    priceRmbPerUnit: round((i.priceRmbPerPcs || 0) * i.pcsPerUnit, 4),
    goodsPerPcs: round(goodsPerPcs),
    goodsPerUnit: round(goodsPerUnit),
    freightPerKoli: round(freightPerKoli),
    freightPerUnit: round(freightPerUnit),
    freightPerPcs: round(freightPerPcs),
    cbmPerUnit: round((i.cbmPerKoli || 0) / i.unitsPerKoli, 6),
    costPerUnit: round(costPerUnit),
    costPerPcs: round(costPerPcs),
    costPerKoli: round(costPerUnit * i.unitsPerKoli),
    pcsPerKoli: i.unitsPerKoli * i.pcsPerUnit,
    markupPercent: sell && costPerUnit > 0 ? round(((sell - costPerUnit) / costPerUnit) * 100, 1) : null
  };
}

/** Isi pcs bawaan untuk satuan: lusin = 12, pcs = 1, lainnya harus diisi. */
export function defaultPcsPerUnit(unit: string, pcsPerUnit?: number | null) {
  if (pcsPerUnit && pcsPerUnit > 0) return pcsPerUnit;
  const u = unit.trim().toLowerCase();
  if (u === "lusin" || u === "dz" || u === "dozen") return 12;
  if (u === "pcs" || u === "pc" || u === "buah") return 1;
  return null;
}
