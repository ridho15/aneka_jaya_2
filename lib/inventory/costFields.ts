/** Field harga modal yang hanya boleh dilihat role yang mengurus modal/barang masuk. */
export const COST_FIELDS = new Set(["costPrice", "priceRmb", "extraCostIdr", "cbmPerUnit", "cbmRateIdr", "avgCost", "stockValue", "unitCost", "totalValue"]);

export function withoutCost(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCost);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => !COST_FIELDS.has(k)).map(([k, v]) => [k, withoutCost(v)]));
  }
  return value;
}
