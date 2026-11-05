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
