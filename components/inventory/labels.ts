export type InvLocation = { id: string; code: string; name: string; type: "WAREHOUSE" | "STORE" };
export type InvProduct = { id: string; sku: string; name: string; unit: string; unitsPerKoli?: number | null };

export function locationLabel(l: InvLocation) {
  return `${l.code} · ${l.name} (${l.type === "STORE" ? "Toko" : "Gudang"})`;
}

/** Hitung qty satuan dari koli + lepas (sama dengan lib/inventory/math.ts). */
export function koliToQty(koli: string, loose: string, unitsPerKoli?: number | null) {
  const k = koli.trim() === "" ? 0 : Number(koli);
  const l = loose.trim() === "" ? 0 : Number(loose);
  if (!Number.isFinite(k) || !Number.isFinite(l)) return NaN;
  return Math.round((k * (unitsPerKoli ?? 0) + l) * 100) / 100;
}

export function koliText(quantity: number, unitsPerKoli: number | null | undefined, unit: string) {
  const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  if (!unitsPerKoli || unitsPerKoli <= 0) return `${fmt(quantity)} ${unit}`;
  const sign = quantity < 0 ? "-" : "";
  const abs = Math.abs(quantity);
  const koli = Math.floor((abs + 1e-9) / unitsPerKoli);
  const loose = Math.round((abs - koli * unitsPerKoli) * 100) / 100;
  if (!koli) return `${fmt(quantity)} ${unit}`;
  return `${sign}${fmt(koli)} koli${loose ? ` + ${fmt(loose)} ${unit}` : ""}`;
}

/** Pecah qty jadi isian form koli + lepas (kebalikan koliToQty). */
export function qtyToKoliFields(quantity: number, unitsPerKoli?: number | null) {
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  if (!unitsPerKoli || unitsPerKoli <= 0 || quantity < 0) return { koli: "", loose: fmt(quantity) };
  const koli = Math.floor((quantity + 1e-9) / unitsPerKoli);
  const loose = Math.round((quantity - koli * unitsPerKoli) * 100) / 100;
  return { koli: koli ? String(koli) : "", loose: loose || !koli ? fmt(loose) : "" };
}
