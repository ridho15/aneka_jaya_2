export type InvLocation = { id: string; code: string; name: string; type: "WAREHOUSE" | "STORE" };
export type InvProduct = { id: string; sku: string; name: string; unit: string };

export function locationLabel(l: InvLocation) {
  return `${l.code} — ${l.name} (${l.type === "STORE" ? "Toko" : "Gudang"})`;
}
