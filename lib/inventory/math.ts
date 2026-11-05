export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Hitung saldo baru setelah mutasi. Barang masuk dengan unitCost memperbarui
 * harga pokok rata-rata (moving average); barang keluar tidak mengubah avgCost.
 */
export function applyDelta(balance: { quantity: number; avgCost: number }, delta: number, unitCost?: number) {
  const quantity = round2(balance.quantity + delta);
  let avgCost = balance.avgCost;
  if (delta > 0 && unitCost != null && unitCost > 0) {
    const baseQty = Math.max(balance.quantity, 0);
    avgCost = baseQty + delta > 0 ? round2((baseQty * balance.avgCost + delta * unitCost) / (baseQty + delta)) : unitCost;
  }
  return { quantity, avgCost };
}

/** Qty dalam satuan barang dari input koli + lepas. Tanpa isi per koli, koli tidak bisa dihitung. */
export function qtyFromKoli(input: { quantity?: number | null; koli?: number | null; loose?: number | null }, unitsPerKoli?: number | null) {
  const hasKoli = input.koli != null && input.koli !== 0;
  const hasLoose = input.loose != null && input.loose !== 0;
  // Qty langsung dipakai kecuali koli/lepas benar-benar diisi (koli & lepas kosong/0 tidak menimpa qty).
  if (input.quantity != null && !hasKoli && !hasLoose) return round2(input.quantity);
  if (hasKoli && !(unitsPerKoli && unitsPerKoli > 0)) return null;
  return round2((input.koli ?? 0) * (unitsPerKoli ?? 0) + (input.loose ?? 0));
}

/** Pecah qty satuan menjadi koli utuh + sisa lepas. */
export function splitKoli(quantity: number, unitsPerKoli?: number | null) {
  if (!unitsPerKoli || unitsPerKoli <= 0) return null;
  const sign = quantity < 0 ? -1 : 1;
  const abs = Math.abs(quantity);
  const koli = Math.floor((abs + 1e-9) / unitsPerKoli);
  return { koli: sign * koli, loose: sign * round2(abs - koli * unitsPerKoli) };
}

/** Teks ringkas, mis. "32 koli + 5 Lusin" atau "120 Lusin" bila isi per koli belum diisi. */
export function formatKoli(quantity: number, unitsPerKoli: number | null | undefined, unit: string) {
  const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  const split = splitKoli(quantity, unitsPerKoli);
  if (!split || split.koli === 0) return `${fmt(quantity)} ${unit}`;
  return split.loose ? `${fmt(split.koli)} koli + ${fmt(split.loose)} ${unit}` : `${fmt(split.koli)} koli`;
}

/** Nama barang dianggap belum diisi bila sama dengan kodenya (umum pada master lama ERP). */
export function hasRealName(name: string, sku: string) {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  return Boolean(name.trim()) && norm(name) !== norm(sku);
}
